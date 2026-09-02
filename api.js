/**
 * DormCare Client API Helper & Integration Layer
 * Connects frontend UI dynamically with the Express.js Backend REST API
 */

const API_BASE_URL = window.location.origin.includes('http') 
    ? window.location.origin + '/api' 
    : 'http://localhost:3000/api';

// Current session state
let currentUser = JSON.parse(localStorage.getItem('dormcare_user')) || {
    id: 1,
    name: 'คุณสมชาย ใจดี',
    email: 'user@dorm.com',
    role: 'resident',
    building: 'อาคาร A',
    room: '402',
    phone: '081-234-5678'
};
let authToken = localStorage.getItem('dormcare_token') || null;

// Helper: Fetch API with Authorization
async function apiFetch(endpoint, options = {}) {
    options.headers = options.headers || {};
    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, options);
        return await res.json();
    } catch (err) {
        console.warn('API fetch error (falling back to offline mock mode):', err);
        return { success: false, offline: true, message: err.message };
    }
}

// ----------------------------------------------------
// AUTHENTICATION
// ----------------------------------------------------
async function handleLogin(email, password) {
    const res = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (res.success) {
        currentUser = res.user;
        authToken = res.token;
        localStorage.setItem('dormcare_user', JSON.stringify(currentUser));
        localStorage.setItem('dormcare_token', authToken);

        Swal.fire({
            icon: 'success',
            title: 'เข้าสู่ระบบสำเร็จ',
            text: `ยินดีต้อนรับคุณ ${currentUser.name}`,
            timer: 1200,
            showConfirmButton: false
        }).then(() => {
            switchRole(currentUser.role || 'resident');
        });
    } else {
        // Fallback for demo if backend server isn't active
        Swal.fire({
            icon: 'success',
            title: 'เข้าสู่ระบบสำเร็จ (Demo)',
            timer: 1200,
            showConfirmButton: false
        }).then(() => {
            switchRole('resident');
        });
    }
}

async function handleRegister(formData) {
    const res = await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    });

    if (res.success) {
        currentUser = res.user;
        authToken = res.token;
        localStorage.setItem('dormcare_user', JSON.stringify(currentUser));
        localStorage.setItem('dormcare_token', authToken);

        Swal.fire({
            icon: 'success',
            title: 'ลงทะเบียนสำเร็จ!',
            text: 'ยินดีต้อนรับสู่ DormCare',
            confirmButtonColor: '#2563EB'
        }).then(() => {
            switchRole('resident');
        });
    } else {
        Swal.fire('ข้อผิดพลาด', res.message || 'ไม่สามารถลงทะเบียนได้', 'error');
    }
}

// ----------------------------------------------------
// REPAIR REQUESTS & DASHBOARD REFRESH
// ----------------------------------------------------
async function fetchAndRenderResidentDashboard() {
    const res = await apiFetch(`/requests?user_id=${currentUser.id || 1}`);
    if (res.success && res.data) {
        const requests = res.data;
        
        // Update counters
        const total = requests.length;
        const pending = requests.filter(r => r.status === 'pending').length;
        const progress = requests.filter(r => r.status === 'in_progress' || r.status === 'assigned').length;
        const completed = requests.filter(r => r.status === 'completed').length;

        const counters = document.querySelectorAll('#resHome .glass-card h3');
        if (counters.length >= 4) {
            counters[0].innerText = total;
            counters[1].innerText = pending;
            counters[2].innerText = progress;
            counters[3].innerText = completed;
        }

        // Render Table
        const tbody = document.querySelector('#resHome table tbody');
        if (tbody) {
            if (requests.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">ยังไม่มีรายการแจ้งซ่อม</td></tr>`;
            } else {
                tbody.innerHTML = requests.map(r => `
                    <tr>
                        <td><strong>${r.request_code}</strong></td>
                        <td><span class="badge bg-primary-subtle text-primary">${r.category}</span></td>
                        <td>${r.description}</td>
                        <td>${new Date(r.created_at).toLocaleDateString('th-TH')}</td>
                        <td>${getStatusBadge(r.status)}</td>
                        <td>
                            ${r.status === 'completed' 
                                ? `<button class="btn btn-sm btn-outline-secondary" onclick="openRatingModal(${r.id}, '${r.request_code}')">ประเมิน</button>` 
                                : `<button class="btn btn-sm btn-outline-primary" onclick="viewTrackingDetail(${r.id})">ดูสถานะ</button>`}
                        </td>
                    </tr>
                `).join('');
            }
        }
    }
}

async function fetchAndRenderAdminDashboard() {
    const resStats = await apiFetch('/stats/dashboard');
    const resJobs = await apiFetch('/requests');

    if (resStats.success && resStats.data) {
        const s = resStats.data;
        const cards = document.querySelectorAll('#adminHome .glass-card h3');
        if (cards.length >= 4) {
            cards[0].innerText = s.pending + s.assigned;
            cards[1].innerText = s.pending;
            cards[2].innerText = s.urgent;
            cards[3].innerText = s.completed;
        }
    }

    if (resJobs.success && resJobs.data) {
        const tbody = document.querySelector('#adminHome table tbody');
        if (tbody) {
            tbody.innerHTML = resJobs.data.map(j => `
                <tr>
                    <td><strong>${j.request_code}</strong></td>
                    <td>${j.user_name} (${j.building_room})</td>
                    <td>${j.category}</td>
                    <td>${getPriorityBadge(j.priority)}</td>
                    <td>${j.tech_name || '-'}</td>
                    <td>${getStatusBadge(j.status)}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="openAssignModal(${j.id}, '${j.request_code}', '${j.category}')">
                            ${j.tech_id ? 'เปลี่ยนช่าง' : 'มอบหมาย'}
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    }
}

async function fetchAndRenderTechDashboard() {
    const res = await apiFetch('/requests');
    if (res.success && res.data) {
        const jobsContainer = document.querySelector('#techHome .row');
        if (jobsContainer) {
            const techJobs = res.data.filter(j => j.status === 'assigned' || j.status === 'in_progress');
            if (techJobs.length === 0) {
                jobsContainer.innerHTML = `<div class="col-12 text-center text-muted py-4">ไม่มีงานซ่อมที่ค้างในขณะนี้</div>`;
            } else {
                jobsContainer.innerHTML = techJobs.map(j => `
                    <div class="col-md-6">
                        <div class="glass-card p-4 border-start border-warning border-4">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                ${getPriorityBadge(j.priority)}
                                <small class="text-muted">${new Date(j.created_at).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})} น.</small>
                            </div>
                            <h5 class="fw-bold">ห้อง ${j.building_room}: ${j.category}</h5>
                            <p class="text-muted small">${j.description}</p>
                            <hr>
                            <div class="d-flex gap-2">
                                <button class="btn btn-sm btn-success w-100" onclick="updateTechStatus('start', ${j.id})"><i class="bi bi-play-circle me-1"></i>เริ่มเข้าซ่อม</button>
                                <button class="btn btn-sm btn-outline-primary w-100" onclick="updateTechStatus('finish', ${j.id})"><i class="bi bi-check-circle me-1"></i>ปิดงานซ่อม</button>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }
    }
}

// ----------------------------------------------------
// NEW ADMIN & RESIDENT TABS RENDERERS
// ----------------------------------------------------

let adminJobsData = [];

async function fetchAndRenderAdminJobs() {
    const res = await apiFetch('/requests');
    if (res.success && res.data) {
        adminJobsData = res.data;
        renderAdminJobsTable(adminJobsData);
    }
}

function renderAdminJobsTable(jobs) {
    const tbody = document.querySelector('#adminJobsTable tbody');
    if (!tbody) return;
    if (jobs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">ไม่พบรายการแจ้งซ่อม</td></tr>`;
        return;
    }
    tbody.innerHTML = jobs.map(j => `
        <tr>
            <td><strong>${j.request_code}</strong></td>
            <td>${j.user_name}<br><small class="text-muted">${j.building_room}</small></td>
            <td><span class="badge bg-primary-subtle text-primary">${j.category}</span></td>
            <td>${getPriorityBadge(j.priority)}</td>
            <td>${j.tech_name ? `<i class="bi bi-person-wrench me-1"></i>${j.tech_name}` : '<span class="text-muted">-</span>'}</td>
            <td><small>${new Date(j.created_at).toLocaleDateString('th-TH')}</small></td>
            <td>${getStatusBadge(j.status)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="openAssignModal(${j.id}, '${j.request_code}', '${j.category}')">
                    <i class="bi bi-person-plus me-1"></i>${j.tech_id ? 'เปลี่ยนช่าง' : 'มอบหมาย'}
                </button>
            </td>
        </tr>
    `).join('');
}

function filterAdminJobs() {
    const search = document.getElementById('adminJobSearch')?.value.toLowerCase() || '';
    const status = document.getElementById('adminJobStatusFilter')?.value || '';
    const priority = document.getElementById('adminJobPriorityFilter')?.value || '';

    const filtered = adminJobsData.filter(j => {
        const matchSearch = j.request_code.toLowerCase().includes(search) ||
                            j.user_name.toLowerCase().includes(search) ||
                            j.building_room.toLowerCase().includes(search) ||
                            j.category.toLowerCase().includes(search);
        const matchStatus = !status || j.status === status;
        const matchPriority = !priority || j.priority === priority;
        return matchSearch && matchStatus && matchPriority;
    });

    renderAdminJobsTable(filtered);
}

function resetAdminJobFilters() {
    if(document.getElementById('adminJobSearch')) document.getElementById('adminJobSearch').value = '';
    if(document.getElementById('adminJobStatusFilter')) document.getElementById('adminJobStatusFilter').value = '';
    if(document.getElementById('adminJobPriorityFilter')) document.getElementById('adminJobPriorityFilter').value = '';
    renderAdminJobsTable(adminJobsData);
}

async function fetchAndRenderAdminTechs() {
    const res = await apiFetch('/technicians');
    const container = document.getElementById('techsCardGrid');
    if (!container) return;

    if (res.success && res.data) {
        container.innerHTML = res.data.map(t => `
            <div class="col-md-6 col-lg-4">
                <div class="glass-card p-4 text-center h-100">
                    <div class="bg-primary text-white rounded-circle fs-3 mx-auto mb-3 d-flex align-items-center justify-content-center" style="width:64px; height:64px;">
                        <i class="bi bi-person-badge"></i>
                    </div>
                    <h5 class="fw-bold mb-1">${t.name}</h5>
                    <span class="badge bg-info-subtle text-info mb-3">${t.specialty || 'ช่างซ่อมบำรุง'}</span>
                    <div class="text-start bg-light p-3 rounded-3 small lh-lg">
                        <div><i class="bi bi-telephone text-primary me-2"></i><strong>เบอร์โทร:</strong> ${t.phone || '-'}</div>
                        <div><i class="bi bi-tools text-primary me-2"></i><strong>สถานะ:</strong> พร้อมปฏิบัติงาน</div>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

async function fetchAndRenderAdminResidents() {
    const res = await apiFetch('/residents');
    const tbody = document.querySelector('#residentsTable tbody');
    if (!tbody) return;

    if (res.success && res.data) {
        tbody.innerHTML = res.data.map((r, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td><strong>${r.name}</strong></td>
                <td><span class="badge bg-secondary-subtle text-dark">${r.room} - ${r.building}</span></td>
                <td>${r.phone || '-'}</td>
                <td>${r.email}</td>
                <td><small>${new Date(r.created_at).toLocaleDateString('th-TH')}</small></td>
            </tr>
        `).join('');
    }
}

async function fetchAndRenderAdminAnnouncements() {
    const res = await apiFetch('/announcements');
    const list = document.getElementById('adminAnnouncementsList');
    if (!list) return;

    if (res.success && res.data) {
        list.innerHTML = res.data.map(a => `
            <div class="border-start border-primary border-3 ps-3 py-2 mb-3 bg-light rounded-2">
                <div class="d-flex justify-content-between align-items-start">
                    <h6 class="fw-bold mb-1">${a.title}</h6>
                    <small class="text-muted">${new Date(a.created_at).toLocaleDateString('th-TH')}</small>
                </div>
                <p class="small text-secondary mb-1">${a.content}</p>
                <small class="text-muted">ผู้ประกาศ: ${a.author}</small>
            </div>
        `).join('');
    }
}

async function submitAnnouncement() {
    const title = document.getElementById('annTitle')?.value;
    const content = document.getElementById('annContent')?.value;

    if (!title || !content) return;

    const res = await apiFetch('/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, author: 'ผู้ดูแลระบบ' })
    });

    if (res.success) {
        document.getElementById('annTitle').value = '';
        document.getElementById('annContent').value = '';
        Swal.fire('สำเร็จ!', 'สร้างประกาศเรียบร้อยแล้ว', 'success').then(() => {
            fetchAndRenderAdminAnnouncements();
        });
    }
}

async function fetchAndRenderResidentHistory() {
    const res = await apiFetch(`/requests?user_id=${currentUser.id || 1}`);
    const tbody = document.querySelector('#residentHistoryTable tbody');
    if (!tbody) return;

    if (res.success && res.data) {
        tbody.innerHTML = res.data.map(r => `
            <tr>
                <td><strong>${r.request_code}</strong></td>
                <td><span class="badge bg-primary-subtle text-primary">${r.category}</span></td>
                <td>${r.description}</td>
                <td><small>${new Date(r.created_at).toLocaleDateString('th-TH')}</small></td>
                <td>${getStatusBadge(r.status)}</td>
                <td>${r.rating ? '⭐'.repeat(r.rating) : '<span class="text-muted">ยังไม่ประเมิน</span>'}</td>
            </tr>
        `).join('');
    }
}

async function fetchAndRenderResidentAnnouncements() {
    const res = await apiFetch('/announcements');
    const feed = document.getElementById('residentAnnouncementsFeed');
    if (!feed) return;

    if (res.success && res.data) {
        feed.innerHTML = res.data.map(a => `
            <div class="col-md-6">
                <div class="glass-card p-4 h-100">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-primary"><i class="bi bi-pin-angle me-1"></i>ประกาศ</span>
                        <small class="text-muted">${new Date(a.created_at).toLocaleDateString('th-TH')}</small>
                    </div>
                    <h5 class="fw-bold text-dark mb-2">${a.title}</h5>
                    <p class="text-secondary small mb-3">${a.content}</p>
                    <div class="border-top pt-2 text-muted small"><i class="bi bi-person-circle me-1"></i>${a.author}</div>
                </div>
            </div>
        `).join('');
    }
}

async function loadPartnerTechnicians() {
    const list = document.getElementById('partnerTechsList');
    if (!list) return;

    const catParam = currentSelectedJobCategory ? `?category=${encodeURIComponent(currentSelectedJobCategory)}` : '';
    const res = await apiFetch(`/matching/partners${catParam}`);
    
    // Default fallback dataset for offline/mock mode
    let techData = [
        { name: 'ช่างอำนาจ ประปาด่วน (ฟรีแลนซ์)', skills: 'ประปา / ท่อน้ำ', distance_km: 1.2, rating_score: 4.9, jobs_done: 87 },
        { name: 'ช่างอนุสรณ์ ประปา & ท่ออุดตัน', skills: 'ประปา / ท่อน้ำ', distance_km: 2.8, rating_score: 4.8, jobs_done: 112 },
        { name: 'ช่างกิตติพงษ์ ไฟฟ้าด่วน (พาร์ทเนอร์)', skills: 'ไฟฟ้า / หลอดไฟ', distance_km: 0.8, rating_score: 4.9, jobs_done: 95 },
        { name: 'ช่างสมเกียรติ ไฟฟ้า & วงจร', skills: 'ไฟฟ้า / หลอดไฟ', distance_km: 2.1, rating_score: 4.8, jobs_done: 64 },
        { name: 'ช่างธีระ แอร์คอนดิชั่น (พาร์ทเนอร์)', skills: 'เครื่องปรับอากาศ', distance_km: 1.5, rating_score: 4.9, jobs_done: 140 },
        { name: 'ช่างรุ่งโรจน์ ล้างแอร์ & เติมน้ำยา', skills: 'เครื่องปรับอากาศ', distance_km: 2.9, rating_score: 4.8, jobs_done: 78 },
        { name: 'ช่างสมนึก เน็ตเวิร์ก & Wi-Fi', skills: 'อินเทอร์เน็ต / Wi-Fi', distance_km: 1.8, rating_score: 4.9, jobs_done: 52 },
        { name: 'ช่างประเสริฐ งานประตู/ลูกบิด', skills: 'เฟอร์นิเจอร์ / ประตู', distance_km: 2.0, rating_score: 4.8, jobs_done: 48 },
        { name: 'ป้าบัว 清清洁 แม่บ้าน & ความสะอาด', skills: 'ความสะอาด / ขยะ', distance_km: 1.0, rating_score: 5.0, jobs_done: 160 }
    ];

    if (res.success && res.data && res.data.length > 0) {
        techData = res.data;
    } else if (currentSelectedJobCategory) {
        const mainCat = currentSelectedJobCategory.split('/')[0].trim().toLowerCase();
        const filtered = techData.filter(t => t.skills.toLowerCase().includes(mainCat));
        if (filtered.length > 0) techData = filtered;
    }

    list.innerHTML = techData.map((t, idx) => `
        <div class="list-group-item d-flex justify-content-between align-items-center p-3">
            <div>
                <h6 class="fw-bold mb-1">${t.name} ${idx === 0 ? '<span class="badge bg-success ms-1"><i class="bi bi-patch-check-fill me-1"></i>ตรงสายงาน 99% Match</span>' : ''}</h6>
                <small class="text-muted">ความชำนาญ: <span class="badge bg-info-subtle text-info">${t.skills}</span> | ระยะทาง: <strong>${t.distance_km} กม.</strong> | ⭐ ${t.rating_score} (${t.jobs_done} งาน)</small>
            </div>
            <button class="btn btn-sm btn-outline-primary" onclick="dispatchSelectedPartner('${t.name}', '${t.distance_km} กม.')">เลือกช่างคนนี้</button>
        </div>
    `).join('');
}

async function autoDispatchPartner() {
    const targetId = currentSelectedJobId || 1;
    const res = await apiFetch('/matching/auto-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: targetId, category: currentSelectedJobCategory })
    });

    bootstrap.Modal.getInstance(document.getElementById('assignModal')).hide();
    
    if (res.success) {
        Swal.fire('จับคู่สำเร็จ!', res.message, 'success').then(() => {
            fetchAndRenderAdminDashboard();
            fetchAndRenderAdminJobs();
        });
    } else {
        const matchedName = currentSelectedJobCategory.includes('ไฟฟ้า') ? 'ช่างกิตติพงษ์ ไฟฟ้าด่วน (0.8 กม.)'
            : currentSelectedJobCategory.includes('แอร์') ? 'ช่างธีระ แอร์คอนดิชั่น (1.5 กม.)'
            : currentSelectedJobCategory.includes('อินเทอร์เน็ต') ? 'ช่างสมนึก เน็ตเวิร์ก (1.8 กม.)'
            : currentSelectedJobCategory.includes('เฟอร์นิเจอร์') ? 'ช่างประเสริฐ งานประตู/ลูกบิด (2.0 กม.)'
            : 'ช่างอำนาจ ประปาด่วน (1.2 กม.)';

        Swal.fire('จับคู่ช่างตรงสายงานสำเร็จ (Demo)!', `ระบบได้ทำการจับคู่ ${matchedName} ซึ่งมีความชำนาญตรงตามประเภท [${currentSelectedJobCategory || 'ประปา'}] เข้าปฏิบัติงานเรียบร้อยแล้ว`, 'success').then(() => {
            fetchAndRenderAdminDashboard();
            fetchAndRenderAdminJobs();
        });
    }
}

async function dispatchSelectedPartner(partnerName, distance) {
    const targetId = currentSelectedJobId || 1;
    await apiFetch(`/requests/${targetId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tech_id: 99,
            tech_name: `${partnerName} (${distance})`,
            eta: '30-45 นาที',
            tech_note: 'ช่างพาร์ทเนอร์ภายนอก (On-Demand Partner)'
        })
    });

    bootstrap.Modal.getInstance(document.getElementById('assignModal')).hide();
    Swal.fire('สำเร็จ!', `มอบหมายงานให้ ${partnerName} เรียบร้อยแล้ว`, 'success').then(() => {
        fetchAndRenderAdminDashboard();
        fetchAndRenderAdminJobs();
    });
}

function logoutUser() {
    localStorage.removeItem('dormcare_user');
    localStorage.removeItem('dormcare_token');
    currentUser = { id: 1, name: 'คุณสมชาย ใจดี', email: 'user@dorm.com', role: 'resident' };
    authToken = null;
    Swal.fire({
        icon: 'success',
        title: 'ออกจากระบบเรียบร้อย',
        timer: 1000,
        showConfirmButton: false
    }).then(() => {
        showSection('homeSection');
    });
}

// ----------------------------------------------------
// UI BADGE HELPERS
// ----------------------------------------------------
function getStatusBadge(status) {
    switch (status) {
        case 'pending': return `<span class="badge badge-pending">รอรับเรื่อง</span>`;
        case 'assigned': return `<span class="badge badge-assigned">มอบหมายช่างแล้ว</span>`;
        case 'in_progress': return `<span class="badge badge-progress">กำลังซ่อม</span>`;
        case 'completed': return `<span class="badge badge-success">เสร็จสิ้น</span>`;
        default: return `<span class="badge bg-secondary">${status}</span>`;
    }
}

function getPriorityBadge(priority) {
    switch (priority) {
        case 'urgent': return `<span class="badge badge-urgent">ฉุกเฉิน</span>`;
        case 'med': return `<span class="badge bg-warning text-dark">ปานกลาง</span>`;
        case 'low': return `<span class="badge bg-info text-dark">ต่ำ</span>`;
        default: return `<span class="badge bg-secondary">${priority}</span>`;
    }
}

// Hook Global Switch Role and Dashboard Tabs to load live data
const originalSwitchRole = window.switchRole;
window.switchRole = function(role) {
    if (originalSwitchRole) originalSwitchRole(role);
    if (role === 'resident') fetchAndRenderResidentDashboard();
    if (role === 'admin') fetchAndRenderAdminDashboard();
    if (role === 'technician') fetchAndRenderTechDashboard();
};

const originalShowDashboardTab = window.showDashboardTab;
window.showDashboardTab = function(tabId) {
    if (originalShowDashboardTab) originalShowDashboardTab(tabId);
    if (tabId === 'adminJobs') fetchAndRenderAdminJobs();
    if (tabId === 'adminTechs') fetchAndRenderAdminTechs();
    if (tabId === 'adminResidents') fetchAndRenderAdminResidents();
    if (tabId === 'adminStats') initAdminCharts();
    if (tabId === 'adminAnnounce') fetchAndRenderAdminAnnouncements();
    if (tabId === 'resHistory') fetchAndRenderResidentHistory();
    if (tabId === 'resAnnounce') fetchAndRenderResidentAnnouncements();
};

