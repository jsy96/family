/**
 * 关系网 - 前端应用（对接后端API版本）
 */

// ===== 应用状态管理 =====
const AppState = {
    user: null,
    categories: [],
    memories: [],
    people: [],
    currentView: 'vertical',
    selectedCategory: null,
    linkedPeople: [],
    tempPeople: [],
};

// ===== 用户认证模块 =====
const Auth = {
    // 发送验证码
    async sendCode(phone) {
        if (!/^1\d{10}$/.test(phone)) {
            alert('请输入正确的手机号');
            return false;
        }

        try {
            await API.sendCode(phone);
            alert('验证码已发送（模拟：任意6位数字）');
            return true;
        } catch (error) {
            alert(error.message || '发送验证码失败');
            return false;
        }
    },

    // 验证码登录/注册
    async verifyCode(phone, code, name) {
        if (!code || code.length !== 6) {
            alert('请输入6位验证码');
            return false;
        }
        if (!name || name.trim().length === 0) {
            alert('请输入您的姓名');
            return false;
        }

        try {
            const response = await API.login(phone, code, name.trim());

            AppState.user = response.user;
            API.setToken(response.token);

            // 加载数据
            await this.loadData();

            return true;
        } catch (error) {
            alert(error.message || '登录失败');
            return false;
        }
    },

    // 检查登录状态
    async checkLogin() {
        if (!API.token) {
            return false;
        }

        try {
            const user = await API.getMe();
            AppState.user = user;
            await this.loadData();
            return true;
        } catch (error) {
            API.clearToken();
            return false;
        }
    },

    // 加载用户数据
    async loadData() {
        try {
            const [categories, memories, people] = await Promise.all([
                API.getCategories(),
                API.getAllMemories(),
                API.getPeople(),
            ]);

            AppState.categories = categories;
            AppState.memories = memories;
            AppState.people = people;
        } catch (error) {
            console.error('加载数据失败:', error);
        }
    },

    // 登出
    logout() {
        AppState.user = null;
        AppState.categories = [];
        AppState.memories = [];
        AppState.people = [];
        API.clearToken();
        Router.show('auth-page');
    },
};

// ===== 分类管理模块 =====
const CategoryManager = {
    async create(name, startDate, endDate, location) {
        try {
            const category = await API.createCategory(name, startDate, endDate, location);
            AppState.categories.push(category);
            return category;
        } catch (error) {
            alert(error.message || '创建分类失败');
            return null;
        }
    },

    getAll() {
        return AppState.categories.sort((a, b) => {
            const dateA = new Date(a.start_date || 0);
            const dateB = new Date(b.start_date || 0);
            return dateA - dateB;
        });
    },

    getStats(categoryId) {
        const memories = MemoryManager.getByCategory(categoryId);
        const memoryIds = memories.map(m => m.id);
        const people = new Set();
        memories.forEach(memory => {
            memory.people?.forEach(person => people.add(person.person_id));
        });
        return {
            memoryCount: memories.length,
            peopleCount: people.size,
        };
    },

    async delete(categoryId) {
        try {
            await API.deleteCategory(categoryId);
            AppState.categories = AppState.categories.filter(c => c.id !== categoryId);
            AppState.memories = AppState.memories.filter(m => m.category_id !== categoryId);
        } catch (error) {
            alert(error.message || '删除分类失败');
        }
    },
};

// ===== 记忆管理模块 =====
const MemoryManager = {
    async create(data) {
        try {
            const memory = await API.createMemory(data);
            AppState.memories.push(memory);
            return memory;
        } catch (error) {
            alert(error.message || '创建记忆失败');
            return null;
        }
    },

    getByCategory(categoryId) {
        return AppState.memories
            .filter(m => m.category_id === categoryId)
            .sort((a, b) => {
                if (a.time_unknown && b.time_unknown) return 0;
                if (a.time_unknown) return 1;
                if (b.time_unknown) return -1;
                return new Date(b.occurred_at) - new Date(a.occurred_at);
            });
    },

    getByPerson(personId) {
        return AppState.memories
            .filter(m => m.people?.some(p => p.person_id === personId))
            .sort((a, b) => {
                if (a.time_unknown && b.time_unknown) return 0;
                if (a.time_unknown) return 1;
                if (b.time_unknown) return -1;
                return new Date(b.occurred_at) - new Date(a.occurred_at);
            });
    },

    async delete(memoryId) {
        try {
            await API.deleteMemory(memoryId);
            AppState.memories = AppState.memories.filter(m => m.id !== memoryId);
        } catch (error) {
            alert(error.message || '删除记忆失败');
        }
    },
};

// ===== 人物管理模块 =====
const PersonManager = {
    getOrCreate(name, relationType) {
        name = name.trim();
        const existing = AppState.people.find(p => p.name === name);
        if (existing) {
            return existing;
        }
        // 人物会在创建记忆时自动创建
        return {
            id: 'temp_' + Date.now(),
            name,
            relation_type: relationType || '朋友',
        };
    },

    getAll() {
        return AppState.people;
    },

    async getDetail(personId) {
        try {
            const detail = await API.getPersonDetail(personId);
            return detail;
        } catch (error) {
            alert(error.message || '获取人物详情失败');
            return null;
        }
    },

    getStrength(personId) {
        const person = AppState.people.find(p => p.id === personId);
        if (!person) return { count: 0, percent: 0 };

        const count = person.memory_count || 0;
        const totalMemories = AppState.memories.length || 1;
        const percent = Math.min(100, Math.round((count / totalMemories) * 100));

        return { count, percent };
    },

    async delete(personId) {
        try {
            await API.deletePerson(personId);
            AppState.people = AppState.people.filter(p => p.id !== personId);
        } catch (error) {
            alert(error.message || '删除人物失败');
        }
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

    async init() {
        const loggedIn = await Auth.checkLogin();
        if (loggedIn) {
            this.show('main-page');
            TimelineManager.render();
        } else {
            this.show('auth-page');
        }
    },
};

// ===== 时间线渲染模块 =====
const TimelineManager = {
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

            let dateRange = category.start_date || '';
            if (category.end_date) {
                dateRange += ` - ${category.end_date}`;
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
        this.attachMemoryListeners();
    },

    renderHorizontal() {
        const stagesContainer = document.getElementById('horizontal-stages-content');
        const memoriesContainer = document.getElementById('horizontal-memories-content');
        const categories = CategoryManager.getAll();

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

    renderMemoryItem(memory) {
        let dateStr = '';
        if (!memory.time_unknown && memory.occurred_at) {
            const date = new Date(memory.occurred_at);
            dateStr = `📍 ${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
        } else {
            dateStr = '📍 时间不详';
        }

        let peopleTags = '';
        if (memory.people && memory.people.length > 0) {
            peopleTags = '<div class="memory-people">' +
                memory.people.map(p =>
                    `<span class="person-tag" data-person-id="${p.person_id}">${this.escapeHtml(p.name)}</span>`
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

    toggleCategory(categoryId) {
        const list = document.getElementById(`memories-${categoryId}`);
        if (list) {
            list.classList.toggle('hidden');
        }
    },

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

    render() {
        if (AppState.currentView === 'vertical') {
            this.renderVertical();
        } else {
            this.renderHorizontal();
        }
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
                const personId = tag.dataset.personId;
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

    async show(personId) {
        this.currentPersonId = personId;
        const detail = await PersonManager.getDetail(personId);
        if (!detail) return;

        const strength = PersonManager.getStrength(personId);

        document.getElementById('person-detail-name').textContent = detail.name;
        document.getElementById('detail-person-name').textContent = detail.name;
        document.getElementById('detail-person-relation').textContent = detail.relation_type;
        document.getElementById('strength-count').textContent = strength.count;
        document.getElementById('strength-percent').textContent = strength.percent + '%';
        document.getElementById('strength-fill').style.width = strength.percent + '%';

        const memoriesContainer = document.getElementById('related-memories-list');
        if (detail.memories.length === 0) {
            memoriesContainer.innerHTML = '<p style="color:var(--text-secondary);">暂无相关记忆</p>';
        } else {
            memoriesContainer.innerHTML = detail.memories.map(memory => {
                let dateStr = '';
                if (!memory.time_unknown && memory.occurred_at) {
                    const date = new Date(memory.occurred_at);
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

    async show() {
        Router.show('graph-page');
        await this.render();
    },

    async render() {
        const canvas = document.getElementById('graph-canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;

        try {
            const data = await API.getGraphData();
            this.buildGraph(data);

            ctx.clearRect(0, 0, width, height);

            if (this.nodes.length === 0) {
                ctx.fillStyle = '#64748b';
                ctx.font = '16px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('还没有记忆和人物数据', width / 2, height / 2);
                return;
            }

            this.calculatePositions(width, height);

            this.edges.forEach(edge => {
                const from = this.nodes.find(n => n.id === edge.person1 || n.id === 'center');
                const to = this.nodes.find(n => n.id === edge.person2 || n.id === 'center');
                if (from && to) {
                    ctx.beginPath();
                    ctx.moveTo(from.x, from.y);
                    ctx.lineTo(to.x, to.y);
                    ctx.strokeStyle = `rgba(99, 102, 241, ${Math.min(1, edge.weight / 10)})`;
                    ctx.lineWidth = Math.min(10, edge.weight);
                    ctx.stroke();
                }
            });

            this.nodes.forEach(node => {
                ctx.beginPath();
                ctx.arc(node.x, node.y, 30, 0, Math.PI * 2);
                ctx.fillStyle = node.isCenter ? '#6366f1' : '#8b5cf6';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 3;
                ctx.stroke();

                ctx.fillStyle = 'white';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const shortName = (node.name || '').length > 4 ? node.name.slice(0, 4) + '...' : node.name;
                ctx.fillText(shortName, node.x, node.y);

                ctx.fillStyle = '#1e293b';
                ctx.font = '11px sans-serif';
                ctx.fillText(node.name || '', node.x, node.y + 45);
                ctx.fillStyle = '#64748b';
                ctx.font = '10px sans-serif';
                ctx.fillText(node.relationType || '', node.x, node.y + 58);
            });

            canvas.onclick = (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                for (const node of this.nodes) {
                    const dx = x - node.x;
                    const dy = y - node.y;
                    if (dx * dx + dy * dy < 900) {
                        if (!node.isCenter) {
                            PersonDetailModal.show(node.id);
                        }
                        break;
                    }
                }
            };
        } catch (error) {
            console.error('加载图谱数据失败:', error);
        }
    },

    buildGraph(data) {
        this.nodes = [];
        this.edges = [];

        this.nodes.push({
            id: 'center',
            name: data.user?.name || '我',
            relationType: '我',
            isCenter: true,
            memoryCount: 0,
        });

        (data.people || []).forEach(person => {
            this.nodes.push({
                id: person.id,
                name: person.name,
                relationType: person.relation_type,
                isCenter: false,
                memoryCount: person.memory_count || 0,
            });
        });

        this.edges = data.relations || [];
    },

    calculatePositions(width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.35;

        this.nodes[0].x = centerX;
        this.nodes[0].y = centerY;

        const otherNodes = this.nodes.slice(1);
        otherNodes.forEach((node, index) => {
            const angle = (2 * Math.PI * index) / otherNodes.length - Math.PI / 2;
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
        });
    },
};

// ===== 初始化应用 =====
document.addEventListener('DOMContentLoaded', async () => {
    await Router.init();

    if (AppState.user) {
        document.getElementById('user-avatar').textContent = AppState.user.name[0] || '👤';
    }

    // ===== 注册/登录相关事件 =====
    let countdown = 0;
    let countdownTimer = null;

    document.getElementById('send-code-btn').addEventListener('click', async () => {
        const phone = document.getElementById('phone').value;
        if (await Auth.sendCode(phone)) {
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
        }
    });

    document.getElementById('login-btn').addEventListener('click', async () => {
        const phone = document.getElementById('phone').value;
        const code = document.getElementById('code').value;
        const name = document.getElementById('name').value;

        if (await Auth.verifyCode(phone, code, name)) {
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

    document.getElementById('save-category-btn').addEventListener('click', async () => {
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

        const category = await CategoryManager.create(name, startDate, endDate, location);
        if (category) {
            Modal.close('category-modal');

            document.getElementById('category-name').value = '';
            document.getElementById('start-year').value = '';
            document.getElementById('start-month').value = '';
            document.getElementById('end-year').value = '';
            document.getElementById('end-month').value = '';
            document.getElementById('category-location').value = '';

            TimelineManager.render();
        }
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
            relationType: person.relation_type || person.relationType,
        });

        document.getElementById('new-person-name').value = '';
        Modal.renderLinkedPeople();
    });

    document.getElementById('save-memory-btn').addEventListener('click', async () => {
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

        const memory = await MemoryManager.create({
            category_id: categoryId,
            title,
            description,
            occurred_at: occurredAt,
            time_unknown: timeUnknown,
            people: AppState.tempPeople,
        });

        if (memory) {
            Modal.close('memory-modal');

            document.getElementById('memory-category-select').value = '';
            document.getElementById('memory-title').value = '';
            document.getElementById('memory-description').value = '';
            document.getElementById('memory-year').value = '';
            document.getElementById('memory-month').value = '';
            document.getElementById('memory-day').value = '';
            document.getElementById('time-unknown').checked = false;

            // 重新加载数据
            await Auth.loadData();
            TimelineManager.render();
        }
    });

    // ===== 人物详情相关事件 =====
    document.getElementById('delete-person-btn').addEventListener('click', async () => {
        if (PersonDetailModal.currentPersonId && confirm('确定要删除这个人物吗？')) {
            await PersonManager.delete(PersonDetailModal.currentPersonId);
            Modal.close('person-detail-modal');
            await Auth.loadData();
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

    window.addEventListener('resize', () => {
        if (!document.getElementById('graph-page').classList.contains('hidden')) {
            GraphManager.render();
        }
    });
});
