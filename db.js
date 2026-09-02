const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let dbPath = path.resolve(__dirname, 'dormcare.db');

// Handle Vercel read-only filesystem
if (process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpPath = path.join('/tmp', 'dormcare.db');
    try {
        if (!fs.existsSync(tmpPath) && fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, tmpPath);
        }
        dbPath = tmpPath;
    } catch (err) {
        console.error("Error preparing DB in /tmp:", err);
    }
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Failed to connect to SQLite database:", err);
    }
});

db.serialize(() => {
    // 1. Users Table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'resident', -- 'resident', 'admin', 'technician'
            building TEXT,
            room TEXT,
            phone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 2. Repair Requests Table
    db.run(`
        CREATE TABLE IF NOT EXISTS repair_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_code TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            user_name TEXT,
            building_room TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            image_url TEXT,
            video_url TEXT,
            priority TEXT DEFAULT 'med', -- 'low', 'med', 'urgent'
            status TEXT DEFAULT 'pending', -- 'pending', 'assigned', 'in_progress', 'completed'
            tech_id INTEGER,
            tech_name TEXT,
            eta TEXT,
            tech_note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (tech_id) REFERENCES users(id)
        )
    `);

    // 3. Ratings Table
    db.run(`
        CREATE TABLE IF NOT EXISTS ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (request_id) REFERENCES repair_requests(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 4. Announcements Table
    db.run(`
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            author TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 5. Partner Technicians Table (On-Demand Matching)
    db.run(`
        CREATE TABLE IF NOT EXISTS partner_technicians (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            skills TEXT NOT NULL, -- JSON string or comma separated e.g. 'ประปา, ไฟฟ้า, แอร์'
            distance_km REAL NOT NULL DEFAULT 2.5,
            rating_score REAL DEFAULT 4.8,
            jobs_done INTEGER DEFAULT 45,
            price_estimate TEXT DEFAULT '300-500 บาท',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Seed Partner Technicians if empty
    db.get("SELECT COUNT(*) as count FROM partner_technicians", (err, row) => {
        if (!row || row.count < 10) {
            db.run(`DELETE FROM partner_technicians`);
            db.run(`INSERT INTO partner_technicians (name, phone, skills, distance_km, rating_score, jobs_done, price_estimate) VALUES
                ('ช่างอำนาจ ประปาด่วน (ฟรีแลนซ์)', '089-111-8888', 'ประปา / ท่อน้ำ', 1.2, 4.9, 87, '300 - 500 บาท'),
                ('ช่างอนุสรณ์ ประปา & ท่ออุดตัน', '081-999-1111', 'ประปา / ท่อน้ำ', 2.8, 4.8, 112, '350 - 600 บาท'),
                ('ช่างเกียรติศักดิ์ ซ่อมระบบน้ำหอพัก', '084-222-3333', 'ประปา / ท่อน้ำ', 3.5, 4.7, 54, '300 - 450 บาท'),
                
                ('ช่างกิตติพงษ์ ไฟฟ้าด่วน (พาร์ทเนอร์)', '086-222-7777', 'ไฟฟ้า / หลอดไฟ', 0.8, 4.9, 95, '350 - 600 บาท'),
                ('ช่างสมเกียรติ ไฟฟ้า & วงจร', '083-444-8888', 'ไฟฟ้า / หลอดไฟ', 2.1, 4.8, 64, '300 - 500 บาท'),
                ('ช่างชัยรัตน์ อิเล็กทรอนิกส์ด่วน', '088-555-9999', 'ไฟฟ้า / หลอดไฟ', 3.9, 4.6, 40, '400 - 700 บาท'),

                ('ช่างธีระ แอร์คอนดิชั่น (พาร์ทเนอร์)', '081-333-6666', 'เครื่องปรับอากาศ', 1.5, 4.9, 140, '500 - 800 บาท'),
                ('ช่างรุ่งโรจน์ ล้างแอร์ & เติมน้ำยา', '087-777-2222', 'เครื่องปรับอากาศ', 2.9, 4.8, 78, '500 - 750 บาท'),

                ('ช่างสมนึก เน็ตเวิร์ก & Wi-Fi', '085-888-3333', 'อินเทอร์เน็ต / Wi-Fi', 1.8, 4.9, 52, '300 - 500 บาท'),
                ('ช่างวรวิทย์ ระบบสื่อสาร & สายแลน', '082-666-4444', 'อินเทอร์เน็ต / Wi-Fi', 3.2, 4.7, 36, '350 - 550 บาท'),

                ('ช่างประเสริฐ งานประตู/ลูกบิด', '084-444-5555', 'เฟอร์นิเจอร์ / ประตู', 2.0, 4.8, 48, '300 - 450 บาท'),
                ('ช่างนิกร ซ่อมเฟอร์นิเจอร์ & ไม้', '089-777-1111', 'เฟอร์นิเจอร์ / ประตู', 4.1, 4.6, 29, '350 - 600 บาท'),

                ('ป้าบัว 清洁 แม่บ้าน & ความสะอาด', '086-111-4444', 'ความสะอาด / ขยะ', 1.0, 5.0, 160, '250 - 400 บาท'),
                ('ทีมงานบิ๊กคลีนนิ่ง หอพัก', '083-222-5555', 'ความสะอาด / ขยะ', 2.4, 4.8, 90, '300 - 500 บาท')
            `);
        }
    });

    // Seed Default Data if empty
    db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
        if (err) return console.error(err);
        if (row.count === 0) {
            console.log("Seeding initial data into SQLite database...");
            const defaultPassword = await bcrypt.hash('123456', 10);

            // Users
            db.run(`INSERT INTO users (name, email, password_hash, role, building, room, phone) VALUES 
                ('คุณสมชาย ใจดี', 'user@dorm.com', ?, 'resident', 'อาคาร A', '402', '081-234-5678'),
                ('ผู้ดูแลระบบ (Admin)', 'admin@dorm.com', ?, 'admin', '-', '-', '089-999-9999'),
                ('ช่างวิชัย ซ่อมไว', 'tech1@dorm.com', ?, 'technician', 'แผนกซ่อม', 'เชี่ยวชาญประปา/แอร์', '082-111-2222'),
                ('ช่างสมศักดิ์ ไฟแรง', 'tech2@dorm.com', ?, 'technician', 'แผนกซ่อม', 'เชี่ยวชาญระบบไฟฟ้า', '083-333-4444'),
                ('คุณนภา สุขใจ', 'napha@dorm.com', ?, 'resident', 'อาคาร B', '201', '084-555-6666')
            `, [defaultPassword, defaultPassword, defaultPassword, defaultPassword, defaultPassword]);

            // Repair Requests
            db.run(`INSERT INTO repair_requests 
                (request_code, user_id, user_name, building_room, category, description, priority, status, tech_id, tech_name, eta, tech_note, created_at)
                VALUES 
                ('#REQ-005', 1, 'คุณสมชาย ใจดี', '402 - อาคาร A', 'ประปา / ท่อน้ำ', 'น้ำหยดใต้ซิงค์ล้างจาน', 'med', 'in_progress', 3, 'ช่างวิชัย ซ่อมไว', '2026-07-26T15:00', 'กำลังดำเนินการเปลี่ยนข้อต่อท่อ PVC ใหม่', '2026-07-26 09:30:00'),
                ('#REQ-004', 1, 'คุณสมชาย ใจดี', '402 - อาคาร A', 'ไฟฟ้า / หลอดไฟ', 'ไฟระเบียงดับ', 'low', 'completed', 4, 'ช่างสมศักดิ์ ไฟแรง', '2026-07-20T16:00', 'เปลี่ยนหลอด LED ใหม่เรียบร้อย', '2026-07-20 10:00:00'),
                ('#REQ-006', 5, 'คุณนภา สุขใจ', '201 - อาคาร B', 'ไฟฟ้า / หลอดไฟ', 'ไฟฟ้าลัดวงจร มีเสียงสปาร์คที่ปลั๊กไฟข้างเตียง มีกลิ่นไหม้', 'urgent', 'pending', NULL, NULL, NULL, NULL, '2026-07-26 11:15:00'),
                ('#REQ-003', 1, 'คุณสมชาย ใจดี', '402 - อาคาร A', 'เครื่องปรับอากาศ', 'แอร์ไม่เย็น มีเสียงดัง', 'med', 'completed', 3, 'ช่างวิชัย ซ่อมไว', '2026-07-15T14:00', 'ล้างแอร์และเติมน้ำยาแอร์เรียบร้อย', '2026-07-14 13:00:00'),
                ('#REQ-002', 1, 'คุณสมชาย ใจดี', '402 - อาคาร A', 'ประปา / ท่อน้ำ', 'ชักโครกกดไม่ลง', 'med', 'completed', 3, 'ช่างวิชัย ซ่อมไว', '2026-07-02T11:00', 'แก้ไขลูกลอยชักโครก', '2026-07-01 08:30:00'),
                ('#REQ-001', 1, 'คุณสมชาย ใจดี', '402 - อาคาร A', 'อินเทอร์เน็ต / Wi-Fi', 'สัญญาณ Wi-Fi หลุดบ่อย', 'low', 'completed', 4, 'ช่างสมศักดิ์ ไฟแรง', '2026-06-25T17:00', 'รีเซ็ต Access Point ประจำชั้น', '2026-06-25 14:20:00')
            `);

            // Ratings
            db.run(`INSERT INTO ratings (request_id, user_id, rating, comment) VALUES 
                (2, 1, 4, 'ช่างสุภาพ บริการรวดเร็วมากครับ'),
                (4, 1, 5, 'แอร์เย็นฉ่ำเรียบร้อย'),
                (5, 1, 5, 'มาตรงเวลา บริการดีมาก')
            `);

            // Announcements
            db.run(`INSERT INTO announcements (title, content, author) VALUES 
                ('แจ้งล้างแท็งก์น้ำประจำปี', 'ทางหอพักจะทำการล้างแท็งก์น้ำในวันที่ 30 กรกฎาคม ตั้งแต่เวลา 09:00 - 15:00 น. น้ำจะไหลเบาหรือหยุดไหลชั่วคราว', 'ผู้ดูแลระบบ'),
                ('ปรับปรุงสัญญาณ Wi-Fi ชั้น 4', 'ฝ่ายไอทีจะทำการอัปเกรดอุปกรณ์ Wi-Fi router ชั้น 4 ในวันศุกร์นี้', 'ฝ่ายซ่อมบำรุง')
            `);

            console.log("Database seeded successfully!");
        }
    });
});

module.exports = db;
