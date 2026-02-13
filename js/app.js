// ===== 应用状态管理 =====
const AppState = {
    user: null,
    categories: [],
    memories: [],
    people: [],
    currentView: 'vertical', // 'vertical' or 'horizontal'
    selectedCategory: null,
    linkedPeople: [],
    tempPeople: [], // 临时存储添加记忆时关联的人物
};

// ===== 数据存储 =====
const Storage = {
    KEYS: {
        USER: 'relation_network_user',
        CATEGORIES: 'relation_network_categories',
        MEMORIES: 'relation_network_memories',
        PEOPLE: 'relation_network_people',
    },

    save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },

    load(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    // 保存所有数据
    saveAll() {
        this.save(this.KEYS.USER, AppState.user);
        this.save(this.KEYS.CATEGORIES, AppState.categories);
        this.save(this.KEYS.MEMORIES, AppState.memories);
        this.save(this.KEYS.PEOPLE, AppState.people);
    },

    // 加载所有数据
    loadAll() {
        AppState.user = this.load(this.KEYS.USER);
        AppState.categories = this.load(this.KEYS.CATEGORIES) || [];
        AppState.memories = this.load(this.KEYS.MEMORIES) || [];
        AppState.people = this.load(this.KEYS.PEOPLE) || [];
    },

    // 清空所有数据
    clearAll() {
        this.remove(this.KEYS.USER);
        this.remove(this.KEYS.CATEGORIES);
        this.remove(this.KEYS.MEMORIES);
        this.remove(this.KEYS.PEOPLE);
    },
};

// ===== 用户认证模块 =====
const Auth = {
    // 模拟发送验证码
    sendCode(phone) {
        if (!/^1\d{10}$/.test(phone)) {
            alert('请输入正确的手机号');
            return false;
        }
        return true;
    },

    // 模拟验证码验证
    verifyCode(phone, code, name) {
        if (!code || code.length !== 6) {
            alert('请输入6位验证码');
            return false;
        }
        if (!name || name.trim().length === 0) {
            alert('请输入您的姓名');
            return false;
        }

        // 创建用户
        AppState.user = {
            id: Date.now(),
            phone,
            name: name.trim(),
            avatar: '👤',
            createdAt: new Date().toISOString(),
        };

        Storage.saveAll();
        return true;
    },

    // 检查登录状态
    checkLogin() {
        Storage.loadAll();
        return AppState.user !== null;
    },

    // 登出
    logout() {
        AppState.user = null;
        Storage.remove(Storage.KEYS.USER);
        Router.show('auth-page');
    },
};

// ===== 分类管理模块 =====
const CategoryManager = {
    // 创建分类
    create(name, startDate, endDate, location) {
        const category = {
            id: Date.now(),
            userId: AppState.user.id,
            name: name.trim(),
            startDate,
            endDate,
            location: location?.trim() || '',
            createdAt: new Date().toISOString(),
        };
        AppState.categories.push(category);
        Storage.saveAll();
        return category;
    },

    // 获取所有分类（按开始时间排序）
    getAll() {
        return AppState.categories
            .filter(c => c.userId === AppState.user.id)
            .sort((a, b) => {
                const dateA = new Date(a.startDate);
                const dateB = new Date(b.startDate);
                return dateA - dateB;
            });
    },

    // 获取分类的统计信息
    getStats(categoryId) {
        const memories = MemoryManager.getByCategory(categoryId);
        const memoryIds = memories.map(m => m.id);
        const people = new Set();
        memories.forEach(memory => {
            memory.people?.forEach(person => people.add(person.personId));
        });
        return {
            memoryCount: memories.length,
            peopleCount: people.size,
        };
    },

    // 删除分类
    delete(categoryId) {
        AppState.categories = AppState.categories.filter(c => c.id !== categoryId);
        // 同时删除该分类下的所有记忆
        AppState.memories = AppState.memories.filter(m => m.categoryId !== categoryId);
        Storage.saveAll();
    },
};

// ===== 记忆管理模块 =====
const MemoryManager = {
    // 创建记忆
    create(data) {
        const memory = {
            id: Date.now(),
            userId: AppState.user.id,
            categoryId: data.categoryId,
            title: data.title.trim(),
            description: data.description?.trim() || '',
            occurredAt: data.occurredAt,
            timeUnknown: data.timeUnknown || false,
            people: data.people || [],
            createdAt: new Date().toISOString(),
        };
        AppState.memories.push(memory);
        Storage.saveAll();
        return memory;
    },

    // 获取某分类下的所有记忆
    getByCategory(categoryId) {
        return AppState.memories
            .filter(m => m.categoryId === categoryId && m.userId === AppState.user.id)
            .sort((a, b) => {
                if (a.timeUnknown && b.timeUnknown) return 0;
                if (a.timeUnknown) return 1;
                if (b.timeUnknown) return -1;
                return new Date(b.occurredAt) - new Date(a.occurredAt);
            });
    },

    // 获取某人物相关的所有记忆
    getByPerson(personId) {
        return AppState.memories
            .filter(m => m.userId === AppState.user.id && m.people?.some(p => p.personId === personId))
            .sort((a, b) => {
                if (a.timeUnknown && b.timeUnknown) return 0;
                if (a.timeUnknown) return 1;
                if (b.timeUnknown) return -1;
                return new Date(b.occurredAt) - new Date(a.occurredAt);
            });
    },

    // 更新记忆
    update(memoryId, data) {
        const index = AppState.memories.findIndex(m => m.id === memoryId);
        if (index !== -1) {
            AppState.memories[index] = { ...AppState.memories[index], ...data };
            Storage.saveAll();
        }
    },

    // 删除记忆
    delete(memoryId) {
        AppState.memories = AppState.memories.filter(m => m.id !== memoryId);
        Storage.saveAll();
    },
};

// ===== 人物管理模块 =====
const PersonManager = {
    // 创建或获取人物
    getOrCreate(name, relationType) {
        name = name.trim();
        const existing = AppState.people.find(
            p => p.userId === AppState.user.id && p.name === name
        );
        if (existing) {
            return existing;
        }
        const person = {
            id: Date.now() + Math.random(),
            userId: AppState.user.id,
            name,
            relationType: relationType || '朋友',
            avatar: '👤',
            createdAt: new Date().toISOString(),
        };
        AppState.people.push(person);
        Storage.saveAll();
        return person;
    },

    // 获取所有人物
    getAll() {
        return AppState.people.filter(p => p.userId === AppState.user.id);
    },

    // 获取人物详情
    getDetail(personId) {
        const person = AppState.people.find(p => p.id === personId);
        if (!person) return null;

        const memories = MemoryManager.getByPerson(personId);
        const categories = new Set();
        memories.forEach(memory => {
            const category = AppState.categories.find(c => c.id === memory.categoryId);
            if (category) categories.add(category);
        });

        return {
            ...person,
            memoryCount: memories.length,
            memories,
            categories: Array.from(categories),
        };
    },

    // 计算关系强度
    getStrength(personId) {
        const memories = MemoryManager.getByPerson(personId);
        const totalMemories = AppState.memories.filter(m => m.userId === AppState.user.id).length;
        const maxMemories = Math.max(totalMemories, 1);
        const strength = Math.min(100, Math.round((memories.length / maxMemories) * 100));
        return {
            count: memories.length,
            percent: strength,
        };
    },

    // 删除人物
    delete(personId) {
        AppState.people = AppState.people.filter(p => p.id !== personId);
        // 同时从记忆中移除该人物关联
        AppState.memories.forEach(memory => {
            if (memory.people) {
                memory.people = memory.people.filter(p => p.personId !== personId);
            }
        });
        Storage.saveAll();
    },
};

// ===== 路由模块 =====
const Router = {
    show(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });
        document.getElementById(pageId).classList.remove('hidden');
    },

    init() {
        if (Auth.checkLogin()) {
            this.show('main-page');
            TimelineManager.render();
        } else {
            this.show('auth-page');
        }
    },
};

// ===== 时间线渲染模块 =====
const TimelineManager = {
    // 渲染垂直时间线
    renderVertical() {
        const container = document.getElementById('vertical-timeline-content');
        const categories = CategoryManager.getAll();

        if (categories.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <h3 class="empty-state-title">还没有记忆分类</h3>
                    <p class="empty-state-desc">点击"添加分类"开始记录你的人生</p>
                </div>
            `;
            return;
        }

        let html = '<div class="timeline-line"></div>';

        categories.forEach((category, index) => {
            const stats = CategoryManager.getStats(category.id);
            const memories = MemoryManager.getByCategory(category.id);

            let dateRange = category.startDate || '';
            if (category.endDate) {
                dateRange += ` - ${category.endDate}`;
            }

            html += `
                <div class="timeline-item fade-in" style="animation-delay: ${index * 0.1}s">
                    <div class="timeline-dot"></div>
                    <div class="category-card" data-category-id="${category.id}">
                        <div class="category-header">
                            <div class="category-icon">📍</div>
                            <div class="category-info">
                                <h3 class="category-name">${this.escapeHtml(category.name)}</h3>
                                <p class="category-meta">
                                    ${category.location ? '📍 ' + this.escapeHtml(category.location) : ''}
                                    ${dateRange ? ' · ' + this.escapeHtml(dateRange) : ''}
                                </p>
                            </div>
                        </div>
                        <div class="category-stats">
                            <span class="stat-item">📝 ${stats.memoryCount} 个记忆</span>
                            <span class="stat-item">👥 ${stats.peopleCount} 个人物</span>
                            <button class="expand-btn" onclick="TimelineManager.toggleCategory(${category.id})">
                                ${memories.length > 0 ? '展开 ▼' : ''}
                            </button>
                        </div>
                        <div class="memories-list hidden" id="memories-${category.id}">
                            ${memories.map(memory => this.renderMemoryItem(memory)).join('')}
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        this.attachCategoryListeners();
    },

    // 渲染水平时间线
    renderHorizontal() {
        const stagesContainer = document.getElementById('horizontal-stages-content');
        const memoriesContainer = document.getElementById('horizontal-memories-content');
        const categories = CategoryManager.getAll();

        // 渲染分类标签
        let stagesHtml = categories.map((category, index) => {
            const stats = CategoryManager.getStats(category.id);
            return `
                <button class="stage-chip ${index === 0 ? 'active' : ''}" data-category-id="${category.id}">
                    ${this.escapeHtml(category.name)}
                    <span class="stage-memory-count">${stats.memoryCount} 个记忆</span>
                </button>
            `;
        }).join('');

        stagesContainer.innerHTML = stagesHtml || '<p style="color:var(--text-secondary);padding:20px;">暂无分类</p>';

        // 渲染第一个分类的记忆
        if (categories.length > 0) {
            this.renderHorizontalMemories(categories[0].id);
        } else {
            memoriesContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <h3 class="empty-state-title">还没有记忆分类</h3>
                    <p class="empty-state-desc">点击"添加分类"开始记录你的人生</p>
                </div>
            `;
        }

        this.attachStageListeners();
    },

    // 渲染水平视图中某分类的记忆
    renderHorizontalMemories(categoryId) {
        const container = document.getElementById('horizontal-memories-content');
        const memories = MemoryManager.getByCategory(categoryId);
        const category = AppState.categories.find(c => c.id === categoryId);

        if (memories.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>该分类下还没有记忆，<a href="#" onclick="Modal.open('memory-modal')" style="color:var(--primary-color)">添加记忆</a></p>
                </div>
            `;
            return;
        }

        let html = `<h3 style="margin-bottom:16px;">${this.escapeHtml(category?.name || '')}</h3>`;
        html += memories.map(memory => this.renderMemoryItem(memory)).join('');
        container.innerHTML = html;
        this.attachMemoryListeners();
    },

    // 渲染单条记忆
    renderMemoryItem(memory) {
        let dateStr = '';
        if (!memory.timeUnknown && memory.occurredAt) {
            const date = new Date(memory.occurredAt);
            dateStr = `📍 ${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
        } else {
            dateStr = '📍 时间不详';
        }

        let peopleTags = '';
        if (memory.people && memory.people.length > 0) {
            peopleTags = '<div class="memory-people">' +
                memory.people.map(p =>
                    `<span class="person-tag" data-person-id="${p.personId}">${this.escapeHtml(p.name)}</span>`
                ).join('') +
                '</div>';
        }

        return `
            <div class="memory-item" data-memory-id="${memory.id}">
                <h4 class="memory-title">${this.escapeHtml(memory.title)}</h4>
                <p class="memory-date">${dateStr}</p>
                ${memory.description ? `<p class="memory-description">${this.escapeHtml(memory.description)}</p>` : ''}
                ${peopleTags}
            </div>
        `;
    },

    // 切换分类展开/收起
    toggleCategory(categoryId) {
        const list = document.getElementById(`memories-${categoryId}`);
        if (list) {
            list.classList.toggle('hidden');
        }
    },

    // 切换视图
    toggleView() {
        AppState.currentView = AppState.currentView === 'vertical' ? 'horizontal' : 'vertical';
        const vertical = document.getElementById('vertical-timeline');
        const horizontal = document.getElementById('horizontal-timeline');

        if (AppState.currentView === 'vertical') {
            vertical.classList.remove('hidden');
            horizontal.classList.add('hidden');
            this.renderVertical();
        } else {
            vertical.classList.add('hidden');
            horizontal.classList.remove('hidden');
            this.renderHorizontal();
        }
    },

    // 渲染主视图
    render() {
        if (AppState.currentView === 'vertical') {
            this.renderVertical();
        } else {
            this.renderHorizontal();
        }
    },

    // 附加事件监听器
    attachCategoryListeners() {
        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('expand-btn')) {
                    const categoryId = parseInt(card.dataset.categoryId);
                    this.toggleCategory(categoryId);
                }
            });
        });
    },

    attachStageListeners() {
        document.querySelectorAll('.stage-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.stage-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const categoryId = parseInt(chip.dataset.categoryId);
                this.renderHorizontalMemories(categoryId);
            });
        });
    },

    attachMemoryListeners() {
        document.querySelectorAll('.person-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.stopPropagation();
                const personId = parseInt(tag.dataset.personId);
                PersonDetailModal.show(personId);
            });
        });
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
};

// ===== 弹窗管理模块 =====
const Modal = {
    open(modalId) {
        document.getElementById(modalId).classList.remove('hidden');

        if (modalId === 'memory-modal') {
            this.populateCategorySelect();
        }
    },

    close(modalId) {
        document.getElementById(modalId).classList.add('hidden');

        if (modalId === 'memory-modal') {
            AppState.tempPeople = [];
            this.renderLinkedPeople();
        }
    },

    populateCategorySelect() {
        const select = document.getElementById('memory-category-select');
        const categories = CategoryManager.getAll();
        select.innerHTML = '<option value="">请选择分类</option>' +
            categories.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');
    },

    renderLinkedPeople() {
        const container = document.getElementById('linked-people');
        if (AppState.tempPeople.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = AppState.tempPeople.map((person, index) => `
            <span class="person-tag-sm">
                ${this.escapeHtml(person.name)}
                <span class="remove" onclick="Modal.removePerson(${index})">×</span>
            </span>
        `).join('');
    },

    removePerson(index) {
        AppState.tempPeople.splice(index, 1);
        this.renderLinkedPeople();
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
};

// ===== 人物详情弹窗 =====
const PersonDetailModal = {
    currentPersonId: null,

    show(personId) {
        this.currentPersonId = personId;
        const detail = PersonManager.getDetail(personId);
        if (!detail) return;

        const strength = PersonManager.getStrength(personId);

        document.getElementById('person-detail-name').textContent = detail.name;
        document.getElementById('detail-person-name').textContent = detail.name;
        document.getElementById('detail-person-relation').textContent = detail.relationType;
        document.getElementById('strength-count').textContent = strength.count;
        document.getElementById('strength-percent').textContent = strength.percent + '%';
        document.getElementById('strength-fill').style.width = strength.percent + '%';

        // 渲染相关记忆
        const memoriesContainer = document.getElementById('related-memories-list');
        if (detail.memories.length === 0) {
            memoriesContainer.innerHTML = '<p style="color:var(--text-secondary);">暂无相关记忆</p>';
        } else {
            memoriesContainer.innerHTML = detail.memories.map(memory => {
                let dateStr = '';
                if (!memory.timeUnknown && memory.occurredAt) {
                    const date = new Date(memory.occurredAt);
                    dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
                } else {
                    dateStr = '时间不详';
                }

                return `
                    <div class="related-memory-item">
                        <p class="related-memory-date">${dateStr}</p>
                        <h5 class="related-memory-title">${this.escapeHtml(memory.title)}</h5>
                        ${memory.description ? `<p class="related-memory-desc">${this.escapeHtml(memory.description)}</p>` : ''}
                    </div>
                `;
            }).join('');
        }

        Modal.open('person-detail-modal');
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
};

// ===== 记忆图谱模块 =====
const GraphManager = {
    nodes: [],
    edges: [],

    show() {
        Router.show('graph-page');
        this.render();
    },

    render() {
        const canvas = document.getElementById('graph-canvas');
        const ctx = canvas.getContext('2d');

        // 设置画布大小
        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;

        // 构建节点和边
        this.buildGraph();

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        if (this.nodes.length === 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('还没有记忆和人物数据', width / 2, height / 2);
            return;
        }

        // 计算节点位置（简单布局）
        this.calculatePositions(width, height);

        // 绘制边
        this.edges.forEach(edge => {
            const from = this.nodes.find(n => n.id === edge.from);
            const to = this.nodes.find(n => n.id === edge.to);
            if (from && to) {
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(to.x, to.y);
                ctx.strokeStyle = `rgba(99, 102, 241, ${Math.min(1, edge.weight / 10)})`;
                ctx.lineWidth = Math.min(10, edge.weight);
                ctx.stroke();
            }
        });

        // 绘制节点
        this.nodes.forEach(node => {
            // 绘制圆形背景
            ctx.beginPath();
            ctx.arc(node.x, node.y, 30, 0, Math.PI * 2);
            ctx.fillStyle = node.isCenter ? '#6366f1' : '#8b5cf6';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.stroke();

            // 绘制文字
            ctx.fillStyle = 'white';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const shortName = node.name.length > 4 ? node.name.slice(0, 4) + '...' : node.name;
            ctx.fillText(shortName, node.x, node.y);

            // 绘制标签
            ctx.fillStyle = '#1e293b';
            ctx.font = '11px sans-serif';
            ctx.fillText(node.name, node.x, node.y + 45);
            ctx.fillStyle = '#64748b';
            ctx.font = '10px sans-serif';
            ctx.fillText(node.relationType, node.x, node.y + 58);
        });

        // 添加点击事件
        canvas.onclick = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            for (const node of this.nodes) {
                const dx = x - node.x;
                const dy = y - node.y;
                if (dx * dx + dy * dy < 900) { // 30 * 30
                    if (!node.isCenter) {
                        PersonDetailModal.show(node.id);
                    }
                    break;
                }
            }
        };
    },

    buildGraph() {
        this.nodes = [];
        this.edges = [];

        // 添加中心节点（自己）
        this.nodes.push({
            id: 'center',
            name: AppState.user.name,
            relationType: '我',
            isCenter: true,
            memoryCount: 0,
        });

        // 获取所有人物及其记忆数量
        const people = PersonManager.getAll();
        const personMemoryCounts = {};
        AppState.memories.forEach(memory => {
            if (memory.people) {
                memory.people.forEach(p => {
                    personMemoryCounts[p.personId] = (personMemoryCounts[p.personId] || 0) + 1;
                });
            }
        });

        // 添加人物节点
        people.forEach(person => {
            this.nodes.push({
                id: person.id,
                name: person.name,
                relationType: person.relationType,
                isCenter: false,
                memoryCount: personMemoryCounts[person.id] || 0,
            });
        });

        // 计算人物之间的关系（共同记忆数）
        const personPairs = {};
        AppState.memories.forEach(memory => {
            if (memory.people && memory.people.length >= 2) {
                for (let i = 0; i < memory.people.length; i++) {
                    for (let j = i + 1; j < memory.people.length; j++) {
                        const id1 = memory.people[i].personId;
                        const id2 = memory.people[j].personId;
                        const key = [id1, id2].sort().join('-');
                        personPairs[key] = (personPairs[key] || 0) + 1;
                    }
                }
            }
        });

        // 添加边（中心到人物，以及人物之间的关系）
        people.forEach(person => {
            const weight = personMemoryCounts[person.id] || 1;
            this.edges.push({
                from: 'center',
                to: person.id,
                weight: weight,
            });
        });

        // 添加人物之间的边
        Object.entries(personPairs).forEach(([key, weight]) => {
            const [id1, id2] = key.split('-');
            this.edges.push({
                from: id1,
                to: id2,
                weight: weight,
            });
        });
    },

    calculatePositions(width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.35;

        // 中心节点
        this.nodes[0].x = centerX;
        this.nodes[0].y = centerY;

        // 其他节点分布在圆周上
        const otherNodes = this.nodes.slice(1);
        otherNodes.forEach((node, index) => {
            const angle = (2 * Math.PI * index) / otherNodes.length - Math.PI / 2;
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
        });
    },
};

// ===== 初始化应用 =====
document.addEventListener('DOMContentLoaded', () => {
    // 初始化路由
    Router.init();

    // 更新用户头像
    if (AppState.user) {
        document.getElementById('user-avatar').textContent = AppState.user.name[0] || '👤';
    }

    // ===== 注册/登录相关事件 =====
    let countdown = 0;
    let countdownTimer = null;

    document.getElementById('send-code-btn').addEventListener('click', () => {
        const phone = document.getElementById('phone').value;
        if (Auth.sendCode(phone)) {
            const btn = document.getElementById('send-code-btn');
            btn.disabled = true;
            countdown = 60;
            btn.textContent = `重新获取 ${countdown}s`;

            countdownTimer = setInterval(() => {
                countdown--;
                if (countdown <= 0) {
                    clearInterval(countdownTimer);
                    btn.disabled = false;
                    btn.textContent = '获取验证码';
                } else {
                    btn.textContent = `重新获取 ${countdown}s`;
                }
            }, 1000);

            alert('验证码已发送（模拟：任意6位数字）');
        }
    });

    document.getElementById('login-btn').addEventListener('click', () => {
        const phone = document.getElementById('phone').value;
        const code = document.getElementById('code').value;
        const name = document.getElementById('name').value;

        if (Auth.verifyCode(phone, code, name)) {
            Router.show('main-page');
            TimelineManager.render();
            document.getElementById('user-avatar').textContent = name[0];
        }
    });

    // ===== 主页面相关事件 =====
    document.getElementById('view-toggle').addEventListener('click', () => {
        TimelineManager.toggleView();
    });

    document.getElementById('add-category-btn').addEventListener('click', () => {
        Modal.open('category-modal');
    });

    document.getElementById('add-memory-fab').addEventListener('click', () => {
        Modal.open('memory-modal');
    });

    // ===== 弹窗关闭事件 =====
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            Modal.close(btn.dataset.close);
        });
    });

    // 点击弹窗背景关闭
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });

    // ===== 创建分类相关事件 =====
    document.querySelectorAll('.template-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const template = btn.dataset.template;
            document.getElementById('category-name').value = template;
        });
    });

    document.getElementById('save-category-btn').addEventListener('click', () => {
        const name = document.getElementById('category-name').value;
        const startYear = document.getElementById('start-year').value;
        const startMonth = document.getElementById('start-month').value;
        const endYear = document.getElementById('end-year').value;
        const endMonth = document.getElementById('end-month').value;
        const location = document.getElementById('category-location').value;

        if (!name) {
            alert('请输入分类名称');
            return;
        }

        let startDate = null;
        if (startYear) {
            startDate = startYear + (startMonth ? '-' + String(startMonth).padStart(2, '0') : '');
        }

        let endDate = null;
        if (endYear) {
            endDate = endYear + (endMonth ? '-' + String(endMonth).padStart(2, '0') : '');
        }

        CategoryManager.create(name, startDate, endDate, location);
        Modal.close('category-modal');

        // 清空表单
        document.getElementById('category-name').value = '';
        document.getElementById('start-year').value = '';
        document.getElementById('start-month').value = '';
        document.getElementById('end-year').value = '';
        document.getElementById('end-month').value = '';
        document.getElementById('category-location').value = '';

        TimelineManager.render();
    });

    // ===== 添加记忆相关事件 =====
    document.getElementById('add-person-btn').addEventListener('click', () => {
        const name = document.getElementById('new-person-name').value;
        const relationType = document.getElementById('new-person-relation').value;

        if (!name) {
            alert('请输入姓名');
            return;
        }

        const person = PersonManager.getOrCreate(name, relationType);
        AppState.tempPeople.push({
            personId: person.id,
            name: person.name,
            relationType: person.relationType,
        });

        document.getElementById('new-person-name').value = '';
        Modal.renderLinkedPeople();
    });

    document.getElementById('save-memory-btn').addEventListener('click', () => {
        const categoryId = parseInt(document.getElementById('memory-category-select').value);
        const title = document.getElementById('memory-title').value;
        const description = document.getElementById('memory-description').value;
        const year = document.getElementById('memory-year').value;
        const month = document.getElementById('memory-month').value;
        const day = document.getElementById('memory-day').value;
        const timeUnknown = document.getElementById('time-unknown').checked;

        if (!categoryId) {
            alert('请选择所属分类');
            return;
        }
        if (!title) {
            alert('请输入记忆标题');
            return;
        }

        let occurredAt = null;
        if (!timeUnknown && year) {
            occurredAt = `${year}-${String(month || 1).padStart(2, '0')}-${String(day || 1).padStart(2, '0')}`;
        }

        MemoryManager.create({
            categoryId,
            title,
            description,
            occurredAt,
            timeUnknown,
            people: AppState.tempPeople,
        });

        Modal.close('memory-modal');

        // 清空表单
        document.getElementById('memory-category-select').value = '';
        document.getElementById('memory-title').value = '';
        document.getElementById('memory-description').value = '';
        document.getElementById('memory-year').value = '';
        document.getElementById('memory-month').value = '';
        document.getElementById('memory-day').value = '';
        document.getElementById('time-unknown').checked = false;

        TimelineManager.render();
    });

    // ===== 人物详情相关事件 =====
    document.getElementById('delete-person-btn').addEventListener('click', () => {
        if (PersonDetailModal.currentPersonId && confirm('确定要删除这个人物吗？')) {
            PersonManager.delete(PersonDetailModal.currentPersonId);
            Modal.close('person-detail-modal');
            TimelineManager.render();
        }
    });

    // ===== 记忆图谱相关事件 =====
    document.getElementById('user-avatar').addEventListener('click', () => {
        GraphManager.show();
    });

    document.getElementById('back-to-timeline').addEventListener('click', () => {
        Router.show('main-page');
    });

    // 窗口大小变化时重绘图谱
    window.addEventListener('resize', () => {
        if (!document.getElementById('graph-page').classList.contains('hidden')) {
            GraphManager.render();
        }
    });
});
