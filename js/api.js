/**
 * API 服务模块
 * 对接后端 RESTful API
 */

const API = {
    // API 基础 URL（自动检测环境）
    // 开发环境：http://localhost:3000/api
    // 生产环境：从环境变量或部署后手动修改
    baseURL: (() => {
        // 检查是否在本地开发环境
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3000/api';
        }
        // 生产环境 - 请替换为你的 Railway 后端 URL
        // 例如：return 'https://your-backend.railway.app/api';
        return 'https://your-backend.railway.app/api';
    })(),

    // 认证令牌
    token: localStorage.getItem('auth_token'),

    // 设置认证令牌
    setToken(token) {
        this.token = token;
        localStorage.setItem('auth_token', token);
    },

    // 清除认证令牌
    clearToken() {
        this.token = null;
        localStorage.removeItem('auth_token');
    },

    // 获取请求头
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    },

    // 通用请求方法
    async request(url, options = {}) {
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options.headers,
            },
        };

        try {
            const response = await fetch(`${this.baseURL}${url}`, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '请求失败');
            }

            return data;
        } catch (error) {
            console.error('API 请求错误:', error);
            throw error;
        }
    },

    // GET 请求
    async get(url, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = queryString ? `${url}?${queryString}` : url;
        return this.request(fullUrl, { method: 'GET' });
    },

    // POST 请求
    async post(url, data = {}) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    // DELETE 请求
    async delete(url) {
        return this.request(url, { method: 'DELETE' });
    },

    // ===== 认证相关 API =====

    // 发送验证码
    sendCode(phone) {
        return this.post('/auth/send-code', { phone });
    },

    // 登录/注册
    login(phone, code, name) {
        return this.post('/auth/login', { phone, code, name });
    },

    // 获取当前用户信息
    getMe() {
        return this.get('/user/me');
    },

    // ===== 分类相关 API =====

    // 获取所有分类
    getCategories() {
        return this.get('/categories');
    },

    // 创建分类
    createCategory(name, startDate, endDate, location) {
        return this.post('/categories', {
            name,
            start_date: startDate,
            end_date: endDate,
            location,
        });
    },

    // 删除分类
    deleteCategory(categoryId) {
        return this.delete(`/categories/${categoryId}`);
    },

    // ===== 记忆相关 API =====

    // 获取记忆列表
    getMemories(categoryId) {
        return this.get('/memories', { category_id: categoryId });
    },

    // 获取所有记忆
    getAllMemories() {
        return this.get('/memories');
    },

    // 创建记忆
    createMemory(data) {
        return this.post('/memories', data);
    },

    // 删除记忆
    deleteMemory(memoryId) {
        return this.delete(`/memories/${memoryId}`);
    },

    // ===== 人物相关 API =====

    // 获取所有人物
    getPeople() {
        return this.get('/people');
    },

    // 获取人物详情
    getPersonDetail(personId) {
        return this.get(`/people/${personId}`);
    },

    // 删除人物
    deletePerson(personId) {
        return this.delete(`/people/${personId}`);
    },

    // ===== 图谱相关 API =====

    // 获取图谱数据
    getGraphData() {
        return this.get('/graph');
    },

    // ===== 健康检查 =====

    // 检查服务器状态
    healthCheck() {
        return this.get('/health');
    },
};
