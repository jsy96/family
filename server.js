/**
 * 关系网 - 后端服务器
 * Node.js + Express + SQLite
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ===== 数据库初始化 =====
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('数据库连接失败:', err.message);
    } else {
        console.log('数据库连接成功');
        initDatabase();
    }
});

// 初始化数据库表
function initDatabase() {
    // 用户表
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone VARCHAR(11) UNIQUE NOT NULL,
            name VARCHAR(20) NOT NULL,
            avatar VARCHAR(255),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 验证码表（开发环境，5分钟有效期）
    db.run(`
        CREATE TABLE IF NOT EXISTS verification_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone VARCHAR(11) NOT NULL,
            code VARCHAR(6) NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 记忆分类表
    db.run(`
        CREATE TABLE IF NOT EXISTS memory_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name VARCHAR(50) NOT NULL,
            start_date VARCHAR(20),
            end_date VARCHAR(20),
            location VARCHAR(100),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // 记忆表
    db.run(`
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            title VARCHAR(100) NOT NULL,
            description TEXT,
            occurred_at DATE,
            time_unknown BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES memory_categories(id) ON DELETE CASCADE
        )
    `);

    // 人物表
    db.run(`
        CREATE TABLE IF NOT EXISTS people (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name VARCHAR(20) NOT NULL,
            relation_type VARCHAR(20) NOT NULL DEFAULT '朋友',
            avatar VARCHAR(255),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // 记忆-人物关联表
    db.run(`
        CREATE TABLE IF NOT EXISTS memory_people (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            memory_id INTEGER NOT NULL,
            person_id INTEGER NOT NULL,
            person_name VARCHAR(20) NOT NULL,
            relation_type VARCHAR(20),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
            FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
            UNIQUE(memory_id, person_id)
        )
    `);

    console.log('数据库表初始化完成');
}

// ===== 中间件 =====
app.use(cors());
app.use(express.json());

// JWT 认证中间件
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: '未提供认证令牌' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '无效的认证令牌' });
        }
        req.user = user;
        next();
    });
};

// ===== 工具函数 =====

// 生成6位验证码
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 发送验证码（开发环境：直接返回验证码）
function sendVerificationCode(phone, code) {
    console.log(`[模拟短信] 发送验证码到 ${phone}: ${code}`);
    // 生产环境需要接入短信服务商（阿里云、腾讯云等）
    return true;
}

// ===== API 路由 =====

// --- 健康检查 ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: '关系网API运行正常' });
});

// --- 用户注册/登录 ---

// 发送验证码
app.post('/api/auth/send-code', (req, res) => {
    const { phone } = req.body;

    if (!phone || !/^1\d{10}$/.test(phone)) {
        return res.status(400).json({ error: '请输入正确的手机号' });
    }

    // 检查频率限制（1分钟内最多1次）
    db.get(
        `SELECT * FROM verification_codes
         WHERE phone = ? AND created_at > datetime('now', '-1 minute')`,
        [phone],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            if (row) {
                return res.status(429).json({ error: '请60秒后再试' });
            }

            const code = generateCode();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

            db.run(
                `INSERT INTO verification_codes (phone, code, expires_at)
                 VALUES (?, ?, ?)`,
                [phone, code, expiresAt],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: '服务器错误' });
                    }
                    sendVerificationCode(phone, code);
                    res.json({ message: '验证码已发送', expiresAt });
                }
            );
        }
    );
});

// 注册/登录（验证码登录）
app.post('/api/auth/login', (req, res) => {
    const { phone, code, name } = req.body;

    if (!phone || !code) {
        return res.status(400).json({ error: '请输入手机号和验证码' });
    }

    // 验证验证码
    db.get(
        `SELECT * FROM verification_codes
         WHERE phone = ? AND code = ? AND expires_at > datetime('now')
         ORDER BY created_at DESC LIMIT 1`,
        [phone, code],
        (err, codeRow) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            if (!codeRow) {
                return res.status(400).json({ error: '验证码错误或已过期' });
            }

            // 查找或创建用户
            db.get(
                `SELECT * FROM users WHERE phone = ?`,
                [phone],
                (err, user) => {
                    if (err) {
                        return res.status(500).json({ error: '服务器错误' });
                    }

                    if (user) {
                        // 用户已存在，返回 token
                        const token = jwt.sign(
                            { id: user.id, phone: user.phone, name: user.name },
                            JWT_SECRET,
                            { expiresIn: '30d' }
                        );
                        res.json({
                            token,
                            user: {
                                id: user.id,
                                phone: user.phone,
                                name: user.name,
                                avatar: user.avatar,
                            }
                        });
                    } else {
                        // 新用户注册
                        if (!name) {
                            return res.status(400).json({ error: '请输入您的姓名' });
                        }

                        db.run(
                            `INSERT INTO users (phone, name) VALUES (?, ?)`,
                            [phone, name],
                            function (err) {
                                if (err) {
                                    return res.status(500).json({ error: '服务器错误' });
                                }

                                const userId = this.lastID;
                                const token = jwt.sign(
                                    { id: userId, phone, name },
                                    JWT_SECRET,
                                    { expiresIn: '30d' }
                                );

                                res.json({
                                    token,
                                    user: {
                                        id: userId,
                                        phone,
                                        name,
                                        avatar: null,
                                    }
                                });
                            }
                        );
                    }
                }
            );
        }
    );
});

// 获取当前用户信息
app.get('/api/user/me', authenticateToken, (req, res) => {
    db.get(
        `SELECT id, phone, name, avatar, created_at FROM users WHERE id = ?`,
        [req.user.id],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }
            res.json(user);
        }
    );
});

// --- 记忆分类 ---

// 获取所有分类
app.get('/api/categories', authenticateToken, (req, res) => {
    db.all(
        `SELECT * FROM memory_categories
         WHERE user_id = ?
         ORDER BY start_date ASC`,
        [req.user.id],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            res.json(rows);
        }
    );
});

// 创建分类
app.post('/api/categories', authenticateToken, (req, res) => {
    const { name, start_date, end_date, location } = req.body;

    if (!name) {
        return res.status(400).json({ error: '分类名称不能为空' });
    }

    db.run(
        `INSERT INTO memory_categories (user_id, name, start_date, end_date, location)
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, name, start_date || null, end_date || null, location || null],
        function (err) {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }

            res.json({
                id: this.lastID,
                user_id: req.user.id,
                name,
                start_date,
                end_date,
                location,
            });
        }
    );
});

// 删除分类
app.delete('/api/categories/:id', authenticateToken, (req, res) => {
    const categoryId = req.params.id;

    // 先检查分类是否属于当前用户
    db.get(
        `SELECT * FROM memory_categories WHERE id = ? AND user_id = ?`,
        [categoryId, req.user.id],
        (err, category) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            if (!category) {
                return res.status(404).json({ error: '分类不存在' });
            }

            db.run(
                `DELETE FROM memory_categories WHERE id = ?`,
                [categoryId],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: '服务器错误' });
                    }
                    res.json({ message: '分类已删除' });
                }
            );
        }
    );
});

// --- 记忆 ---

// 获取某分类下的所有记忆
app.get('/api/memories', authenticateToken, (req, res) => {
    const { category_id } = req.query;

    let query = `
        SELECT m.*,
            GROUP_CONCAT(
                json_object(
                    'personId', mp.person_id,
                    'name', mp.person_name,
                    'relationType', mp.relation_type
                )
            ) as people
        FROM memories m
        LEFT JOIN memory_people mp ON m.id = mp.memory_id
        WHERE m.user_id = ?
    `;
    const params = [req.user.id];

    if (category_id) {
        query += ` AND m.category_id = ?`;
        params.push(category_id);
    }

    query += ` GROUP BY m.id ORDER BY
        CASE WHEN m.time_unknown = 1 THEN 1 ELSE 0 END,
        m.occurred_at DESC`;

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: '服务器错误' });
        }

        // 解析 people JSON
        const memories = rows.map(row => ({
            ...row,
            people: row.people ? JSON.parse(`[${row.people}]`) : [],
        }));

        res.json(memories);
    });
});

// 创建记忆
app.post('/api/memories', authenticateToken, (req, res) => {
    const { category_id, title, description, occurred_at, time_unknown, people } = req.body;

    if (!category_id || !title) {
        return res.status(400).json({ error: '分类和标题不能为空' });
    }

    // 验证分类是否属于当前用户
    db.get(
        `SELECT * FROM memory_categories WHERE id = ? AND user_id = ?`,
        [category_id, req.user.id],
        (err, category) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            if (!category) {
                return res.status(400).json({ error: '分类不存在' });
            }

            db.run(
                `INSERT INTO memories (user_id, category_id, title, description, occurred_at, time_unknown)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.id, category_id, title, description || null, occurred_at || null, time_unknown || 0],
                function (err) {
                    if (err) {
                        return res.status(500).json({ error: '服务器错误' });
                    }

                    const memoryId = this.lastID;

                    // 关联人物
                    if (people && people.length > 0) {
                        const insertPerson = (index) => {
                            if (index >= people.length) {
                                return res.json({ id: memoryId });
                            }

                            const person = people[index];

                            // 查找或创建人物
                            db.get(
                                `SELECT * FROM people WHERE user_id = ? AND name = ?`,
                                [req.user.id, person.name],
                                (err, existingPerson) => {
                                    if (err) {
                                        return res.status(500).json({ error: '服务器错误' });
                                    }

                                    const personId = existingPerson ? existingPerson.id : null;

                                    // 如果人物不存在，创建新人物
                                    if (!personId) {
                                        db.run(
                                            `INSERT INTO people (user_id, name, relation_type)
                                             VALUES (?, ?, ?)`,
                                            [req.user.id, person.name, person.relationType || '朋友'],
                                            function (err) {
                                                if (err) {
                                                    return res.status(500).json({ error: '服务器错误' });
                                                }
                                                // 关联记忆和人物
                                                db.run(
                                                    `INSERT INTO memory_people (memory_id, person_id, person_name, relation_type)
                                                     VALUES (?, ?, ?, ?)`,
                                                    [memoryId, this.lastID, person.name, person.relationType || '朋友'],
                                                    (err) => {
                                                        if (err) {
                                                            return res.status(500).json({ error: '服务器错误' });
                                                        }
                                                        insertPerson(index + 1);
                                                    }
                                                );
                                            }
                                        );
                                    } else {
                                        // 关联记忆和已有人物
                                        db.run(
                                            `INSERT INTO memory_people (memory_id, person_id, person_name, relation_type)
                                             VALUES (?, ?, ?, ?)`,
                                            [memoryId, personId, person.name, person.relationType || '朋友'],
                                            (err) => {
                                                if (err) {
                                                    return res.status(500).json({ error: '服务器错误' });
                                                }
                                                insertPerson(index + 1);
                                            }
                                        );
                                    }
                                }
                            );
                        };

                        insertPerson(0);
                    } else {
                        res.json({ id: memoryId });
                    }
                }
            );
        }
    );
});

// 删除记忆
app.delete('/api/memories/:id', authenticateToken, (req, res) => {
    const memoryId = req.params.id;

    db.get(
        `SELECT * FROM memories WHERE id = ? AND user_id = ?`,
        [memoryId, req.user.id],
        (err, memory) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            if (!memory) {
                return res.status(404).json({ error: '记忆不存在' });
            }

            db.run(
                `DELETE FROM memories WHERE id = ?`,
                [memoryId],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: '服务器错误' });
                    }
                    res.json({ message: '记忆已删除' });
                }
            );
        }
    );
});

// --- 人物 ---

// 获取所有人物
app.get('/api/people', authenticateToken, (req, res) => {
    db.all(
        `SELECT p.*,
            (SELECT COUNT(*) FROM memory_people WHERE person_id = p.id) as memory_count
         FROM people p
         WHERE p.user_id = ?
         ORDER BY memory_count DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            res.json(rows);
        }
    );
});

// 获取人物详情
app.get('/api/people/:id', authenticateToken, (req, res) => {
    const personId = req.params.id;

    db.get(
        `SELECT * FROM people WHERE id = ? AND user_id = ?`,
        [personId, req.user.id],
        (err, person) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            if (!person) {
                return res.status(404).json({ error: '人物不存在' });
            }

            // 获取相关记忆
            db.all(
                `SELECT m.*, mc.name as category_name
                 FROM memories m
                 JOIN memory_categories mc ON m.category_id = mc.id
                 JOIN memory_people mp ON m.id = mp.memory_id
                 WHERE mp.person_id = ? AND m.user_id = ?
                 ORDER BY m.occurred_at DESC`,
                [personId, req.user.id],
                (err, memories) => {
                    if (err) {
                        return res.status(500).json({ error: '服务器错误' });
                    }

                    res.json({
                        ...person,
                        memories,
                        memoryCount: memories.length,
                    });
                }
            );
        }
    );
});

// 删除人物
app.delete('/api/people/:id', authenticateToken, (req, res) => {
    const personId = req.params.id;

    db.get(
        `SELECT * FROM people WHERE id = ? AND user_id = ?`,
        [personId, req.user.id],
        (err, person) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            if (!person) {
                return res.status(404).json({ error: '人物不存在' });
            }

            db.run(
                `DELETE FROM people WHERE id = ?`,
                [personId],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: '服务器错误' });
                    }
                    res.json({ message: '人物已删除' });
                }
            );
        }
    );
});

// --- 获取关系图谱数据 ---
app.get('/api/graph', authenticateToken, (req, res) => {
    const userId = req.user.id;

    // 获取所有人物及其记忆数量
    db.all(
        `SELECT p.id, p.name, p.relation_type,
            (SELECT COUNT(*) FROM memory_people WHERE person_id = p.id) as memory_count
         FROM people p
         WHERE p.user_id = ?`,
        [userId],
        (err, people) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }

            // 获取人物之间的关系（共同记忆数）
            db.all(
                `SELECT mp1.person_id as person1, mp2.person_id as person2, COUNT(*) as weight
                 FROM memory_people mp1
                 JOIN memory_people mp2 ON mp1.memory_id = mp2.memory_id
                 WHERE mp1.person_id < mp2.person_id
                 GROUP BY mp1.person_id, mp2.person_id`,
                [],
                (err, relations) => {
                    if (err) {
                        return res.status(500).json({ error: '服务器错误' });
                    }

                    res.json({
                        user: {
                            id: 'center',
                            name: req.user.name,
                            relationType: '我',
                            isCenter: true,
                        },
                        people,
                        relations,
                    });
                }
            );
        }
    );
});

// ===== 启动服务器 =====
app.listen(PORT, () => {
    console.log(`\n🚀 关系网API服务器运行在 http://localhost:${PORT}`);
    console.log(`📊 数据库: database.sqlite`);
    console.log(`\n可用的API端点:`);
    console.log(`  GET  /api/health`);
    console.log(`  POST /api/auth/send-code`);
    console.log(`  POST /api/auth/login`);
    console.log(`  GET  /api/user/me`);
    console.log(`  GET  /api/categories`);
    console.log(`  POST /api/categories`);
    console.log(`  DELETE /api/categories/:id`);
    console.log(`  GET  /api/memories`);
    console.log(`  POST /api/memories`);
    console.log(`  DELETE /api/memories/:id`);
    console.log(`  GET  /api/people`);
    console.log(`  GET  /api/people/:id`);
    console.log(`  DELETE /api/people/:id`);
    console.log(`  GET  /api/graph`);
    console.log(`\n`);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    db.close((err) => {
        if (err) {
            console.error('关闭数据库时出错:', err.message);
        }
        console.log('数据库连接已关闭');
        process.exit(0);
    });
});
