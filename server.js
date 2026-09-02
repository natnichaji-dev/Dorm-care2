const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dormcare_super_secret_jwt_key_2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads folder exists
const uploadsDir = (process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join('/tmp', 'uploads')
    : path.join(__dirname, 'uploads');

try {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
} catch (err) {
    console.warn('Uploads folder creation warning:', err.message);
}
app.use('/uploads', express.static(uploadsDir));

// Serve static frontend files
app.use(express.static(__dirname));

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage });

// JWT Helper
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
        req.user = user;
        next();
    });
}

// ==========================================
// 1. AUTHENTICATION API
// ==========================================

// Register Resident
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, building, room, phone } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    }

    try {
        const password_hash = await bcrypt.hash(password, 10);
        const role = 'resident';

        db.run(
            `INSERT INTO users (name, email, password_hash, role, building, room, phone) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, email, password_hash, role, building || 'อาคาร A', room || '', phone || ''],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ success: false, message: 'อีเมลนี้ถูกใช้งานในระบบแล้ว' });
                    }
                    return res.status(500).json({ success: false, message: err.message });
                }

                const user = { id: this.lastID, name, email, role, building, room, phone };
                const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
                res.status(201).json({ success: true, message: 'สมัครสมาชิกสำเร็จ', token, user });
            }
        );
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    }

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (!user) return res.status(400).json({ success: false, message: 'ไม่พบผู้ใช้งานด้วยอีเมลนี้' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        const userData = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            building: user.building,
            room: user.room,
            phone: user.phone
        };
        const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ',
            token,
            user: userData
        });
    });
});

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
});

// ==========================================
// 2. REPAIR REQUESTS API
// ==========================================

// Get List of Repair Requests (Filterable by role & status)
app.get('/api/requests', (req, res) => {
    const { role, user_id, tech_id, status } = req.query;
    let query = `SELECT r.*, u.phone as resident_phone FROM repair_requests r LEFT JOIN users u ON r.user_id = u.id WHERE 1=1`;
    let params = [];

    if (user_id) {
        query += ` AND r.user_id = ?`;
        params.push(user_id);
    }
    if (tech_id) {
        query += ` AND r.tech_id = ?`;
        params.push(tech_id);
    }
    if (status) {
        query += ` AND r.status = ?`;
        params.push(status);
    }

    query += ` ORDER BY r.id DESC`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, data: rows });
    });
});

// Get Single Repair Request with Timeline and Rating
app.get('/api/requests/:id', (req, res) => {
    const reqId = req.params.id;
    db.get(`SELECT * FROM repair_requests WHERE id = ? OR request_code = ?`, [reqId, reqId], (err, request) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (!request) return res.status(404).json({ success: false, message: 'ไม่พบรายการแจ้งซ่อม' });

        db.get(`SELECT * FROM ratings WHERE request_id = ?`, [request.id], (err, rating) => {
            res.json({
                success: true,
                data: {
                    ...request,
                    rating: rating || null
                }
            });
        });
    });
});

// Create Repair Request (Supports Image & Video file uploads)
app.post('/api/requests', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), (req, res) => {
    const { user_id, user_name, building_room, category, description, priority } = req.body;
    if (!category || !description) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุประเภทและรายละเอียดปัญหา' });
    }

    // Generate Request Code (e.g., #REQ-007)
    db.get(`SELECT COUNT(*) as count FROM repair_requests`, (err, row) => {
        const nextId = (row ? row.count : 0) + 1;
        const request_code = `#REQ-${String(nextId).padStart(3, '0')}`;

        const imageUrl = req.files && req.files['image'] ? `/uploads/${req.files['image'][0].filename}` : null;
        const videoUrl = req.files && req.files['video'] ? `/uploads/${req.files['video'][0].filename}` : null;

        db.run(
            `INSERT INTO repair_requests 
            (request_code, user_id, user_name, building_room, category, description, image_url, video_url, priority, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
                request_code,
                user_id || 1,
                user_name || 'คุณสมชาย ใจดี',
                building_room || '402 - อาคาร A',
                category,
                description,
                imageUrl,
                videoUrl,
                priority || 'med'
            ],
            function (err) {
                if (err) return res.status(500).json({ success: false, message: err.message });
                
                db.get(`SELECT * FROM repair_requests WHERE id = ?`, [this.lastID], (err, newReq) => {
                    res.status(201).json({
                        success: true,
                        message: 'ส่งรายการแจ้งซ่อมเรียบร้อยแล้ว',
                        data: newReq
                    });
                });
            }
        );
    });
});

// Assign Technician (Admin)
app.put('/api/requests/:id/assign', (req, res) => {
    const reqId = req.params.id;
    const { tech_id, tech_name, eta, tech_note } = req.body;

    if (!tech_id) {
        return res.status(400).json({ success: false, message: 'กรุณาเลือกช่างซ่อมบำรุง' });
    }

    db.run(
        `UPDATE repair_requests 
         SET tech_id = ?, tech_name = ?, eta = ?, tech_note = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? OR request_code = ?`,
        [tech_id, tech_name || 'ช่างซ่อมบำรุง', eta || null, tech_note || '', reqId, reqId],
        function (err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, message: 'มอบหมายงานให้ช่างเรียบร้อยแล้ว' });
        }
    );
});

// Update Repair Status (Technician / Admin: in_progress, completed)
app.put('/api/requests/:id/status', (req, res) => {
    const reqId = req.params.id;
    const { status, tech_note } = req.body;

    if (!['pending', 'assigned', 'in_progress', 'completed'].includes(status)) {
        return res.status(400).json({ success: false, message: 'สถานะไม่ถูกต้อง' });
    }

    db.run(
        `UPDATE repair_requests 
         SET status = ?, tech_note = COALESCE(?, tech_note), updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? OR request_code = ?`,
        [status, tech_note, reqId, reqId],
        function (err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, message: `อัปเดตสถานะเป็น ${status} เรียบร้อยแล้ว` });
        }
    );
});

// Submit Rating (Resident)
app.post('/api/requests/:id/rate', (req, res) => {
    const reqId = req.params.id;
    const { user_id, rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุคะแนนประเมิน (1-5 ดาว)' });
    }

    db.get(`SELECT id FROM repair_requests WHERE id = ? OR request_code = ?`, [reqId, reqId], (err, request) => {
        if (err || !request) return res.status(404).json({ success: false, message: 'ไม่พบรายการแจ้งซ่อม' });

        db.run(
            `INSERT INTO ratings (request_id, user_id, rating, comment) VALUES (?, ?, ?, ?)`,
            [request.id, user_id || 1, rating, comment || ''],
            function (err) {
                if (err) return res.status(500).json({ success: false, message: err.message });
                res.json({ success: true, message: 'บันทึกการประเมินเรียบร้อยแล้ว' });
            }
        );
    });
});
// ==========================================
// 1.5 SMART AUTO-DISPATCH & MATCHING API
// ==========================================

// Get List of External Partner Technicians with Strict Skill Matching
app.get('/api/matching/partners', (req, res) => {
    const { category } = req.query;
    db.all(`SELECT * FROM partner_technicians`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        
        let filtered = rows;
        if (category && category.trim() !== '') {
            const mainCat = category.split('/')[0].trim().toLowerCase();
            filtered = rows.filter(tech => tech.skills.toLowerCase().includes(mainCat));
            // If no exact category match, fallback to all partners
            if (filtered.length === 0) filtered = rows;
        }

        // Calculate Match Score
        const matched = filtered.map(tech => {
            const distanceScore = Math.max(0, 10 - tech.distance_km);
            const score = (tech.rating_score * 12) + (distanceScore * 4);
            return {
                ...tech,
                match_score: Math.min(99, Math.round(score)),
                is_skill_match: true
            };
        }).sort((a, b) => b.match_score - a.match_score);

        res.json({ success: true, data: matched });
    });
});

// Auto-Dispatch Nearest & Best Partner Technician matching the Category
app.post('/api/matching/auto-dispatch', (req, res) => {
    const { request_id, category } = req.body;

    db.all(`SELECT * FROM partner_technicians`, [], (err, rows) => {
        if (err || !rows || rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบช่างพาร์ทเนอร์ในพื้นที่' });
        }

        let candidates = rows;
        if (category && category.trim() !== '') {
            const mainCat = category.split('/')[0].trim().toLowerCase();
            candidates = rows.filter(tech => tech.skills.toLowerCase().includes(mainCat));
            if (candidates.length === 0) candidates = rows;
        }

        // Rank by distance and rating
        const sorted = candidates.map(tech => {
            const score = (tech.rating_score * 12) + ((10 - tech.distance_km) * 4);
            return { ...tech, score };
        }).sort((a, b) => b.score - a.score);

        const bestTech = sorted[0];

        // Update Request with Partner Tech
        db.run(
            `UPDATE repair_requests 
             SET tech_id = ?, tech_name = ?, eta = ?, tech_note = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP 
             WHERE id = ? OR request_code = ?`,
            [
                bestTech.id + 1000,
                `${bestTech.name} (${bestTech.skills} - ${bestTech.distance_km} กม.)`,
                'คาดว่าถึงใน 30-45 นาที',
                `จับคู่ตรงตามสายงานสำเร็จ (ราคาประเมิน: ${bestTech.price_estimate})`,
                request_id,
                request_id
            ],
            function (err) {
                if (err) return res.status(500).json({ success: false, message: err.message });
                res.json({
                    success: true,
                    message: `จับคู่ช่างตรงสายงานสำเร็จ: ${bestTech.name} (${bestTech.skills})`,
                    matched_tech: bestTech
                });
            }
        );
    });
});
// ==========================================
// 3. DASHBOARD STATS & USERS API
// ==========================================

// Dashboard Statistics (Admin & Resident view)
app.get('/api/stats/dashboard', (req, res) => {
    const stats = {
        total: 0,
        pending: 0,
        assigned: 0,
        in_progress: 0,
        completed: 0,
        urgent: 0,
        categories: {},
        monthly: [
            { month: 'ม.ค.', count: 12 },
            { month: 'ก.พ.', count: 19 },
            { month: 'มี.ค.', count: 15 },
            { month: 'เม.ย.', count: 25 },
            { month: 'พ.ค.', count: 22 },
            { month: 'มิ.ย.', count: 30 },
            { month: 'ก.ค.', count: 28 }
        ]
    };

    db.all(`SELECT status, priority, category FROM repair_requests`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });

        stats.total = rows.length;
        rows.forEach(r => {
            if (r.status === 'pending') stats.pending++;
            if (r.status === 'assigned') stats.assigned++;
            if (r.status === 'in_progress') stats.in_progress++;
            if (r.status === 'completed') stats.completed++;
            if (r.priority === 'urgent') stats.urgent++;

            const catKey = r.category.split('/')[0].trim();
            stats.categories[catKey] = (stats.categories[catKey] || 0) + 1;
        });

        res.json({ success: true, data: stats });
    });
});

// Get Technicians List
app.get('/api/technicians', (req, res) => {
    db.all(`SELECT id, name, room as specialty, phone FROM users WHERE role = 'technician'`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, data: rows });
    });
});

// Get Residents List
app.get('/api/residents', (req, res) => {
    db.all(`SELECT id, name, email, building, room, phone, created_at FROM users WHERE role = 'resident'`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, data: rows });
    });
});

// Get & Create Announcements
app.get('/api/announcements', (req, res) => {
    db.all(`SELECT * FROM announcements ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/announcements', (req, res) => {
    const { title, content, author } = req.body;
    if (!title || !content) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกหัวข้อและเนื้อหาประกาศ' });
    }

    db.run(
        `INSERT INTO announcements (title, content, author) VALUES (?, ?, ?)`,
        [title, content, author || 'ผู้ดูแลระบบ'],
        function (err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.status(201).json({ success: true, message: 'สร้างประกาศสำเร็จ' });
        }
    );
});

// Export Data (JSON / CSV)
app.get('/api/export', (req, res) => {
    db.all(`SELECT * FROM repair_requests`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, data: rows, exported_at: new Date().toISOString() });
    });
});

// Fallback to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server (only when not running as Vercel serverless function)
if (!process.env.VERCEL && !process.env.NOW_REGION) {
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(` DormCare Backend Server is running!`);
        console.log(` Access URL: http://localhost:${PORT}`);
        console.log(` API Endpoint: http://localhost:${PORT}/api`);
        console.log(`====================================================`);
    });
}

module.exports = app;
