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
// RESIDENT DASHBOARD & HISTORY
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
                tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">ยังไม่มีรายการแจ้งซ่อม</td></tr>`;
            } else {
                tbody.innerHTML = requests.slice(0, 5).map(r => `
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

async function fetchAndRenderResidentHistory() {
    const res = await apiFetch(`/requests?user_id=${currentUser.id || 1}`);
    const tbody = document.querySelector('#residentHistoryTable tbody');
    if (!tbody) return;

    if (res.success && res.data) {
        if (res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">ไม่พบประวัติการแจ้งซ่อม</td></tr>`;
            return;
        }
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
        if (res.data.length === 0) {
            feed.innerHTML = `<div class="col-12 text-center text-muted py-4">ยังไม่มีประกาศข่าวสาร</div>`;
            return;
        }
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

// ----------------------------------------------------
// 1. ADMIN: REPAIR JOBS MANAGEMENT
// ----------------------------------------------------
let adminJobsData = [];
let currentViewingJob = null;

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
            tbody.innerHTML = resJobs.data.slice(0, 5).map(j => `
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

async function fetchAndRenderAdminJobs() {
    const res = await apiFetch('/requests');
    if (res.success && res.data) {
        adminJobsData = res.data;
        
        // Update summary counters
        const total = adminJobsData.length;
        const pending = adminJobsData.filter(j => j.status === 'pending').length;
        const progress = adminJobsData.filter(j => j.status === 'in_progress' || j.status === 'assigned').length;
        const completed = adminJobsData.filter(j => j.status === 'completed').length;

        if (document.getElementById('adminJobsCountTotal')) document.getElementById('adminJobsCountTotal').innerText = total;
        if (document.getElementById('adminJobsCountPending')) document.getElementById('adminJobsCountPending').innerText = pending;
        if (document.getElementById('adminJobsCountProgress')) document.getElementById('adminJobsCountProgress').innerText = progress;
        if (document.getElementById('adminJobsCountCompleted')) document.getElementById('adminJobsCountCompleted').innerText = completed;

        renderAdminJobsTable(adminJobsData);
    }
}

function renderAdminJobsTable(jobs) {
    const tbody = document.querySelector('#adminJobsTable tbody');
    if (!tbody) return;

    if (jobs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">ไม่พบรายการแจ้งซ่อมตามเงื่อนไข</td></tr>`;
        return;
    }

    tbody.innerHTML = jobs.map(j => `
        <tr>
            <td><strong>${j.request_code}</strong></td>
            <td>
                <strong>${j.user_name}</strong><br>
                <small class="text-muted"><i class="bi bi-geo-alt me-1"></i>${j.building_room}</small>
                ${j.resident_phone ? `<br><a href="tel:${j.resident_phone}" class="small text-decoration-none"><i class="bi bi-telephone me-1"></i>${j.resident_phone}</a>` : ''}
            </td>
            <td><span class="badge bg-primary-subtle text-primary">${j.category}</span></td>
            <td><span class="d-inline-block text-truncate" style="max-width: 180px;">${j.description}</span></td>
            <td>${getPriorityBadge(j.priority)}</td>
            <td>${j.tech_name ? `<span class="badge bg-info-subtle text-info"><i class="bi bi-person-wrench me-1"></i>${j.tech_name}</span>` : '<span class="text-muted small">ยังไม่มอบหมาย</span>'}</td>
            <td><small>${new Date(j.created_at).toLocaleDateString('th-TH')}</small></td>
            <td>${getStatusBadge(j.status)}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="openViewJobModal(${j.id})" title="ดูรายละเอียด">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-primary" onclick="openAssignModal(${j.id}, '${j.request_code}', '${j.category}')" title="มอบหมายช่าง">
                        <i class="bi bi-person-gear"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteRepairRequest(${j.id}, '${j.request_code}')" title="ลบรายการ">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterAdminJobs() {
    const search = (document.getElementById('adminJobSearch')?.value || '').toLowerCase();
    const status = document.getElementById('adminJobStatusFilter')?.value || '';
    const priority = document.getElementById('adminJobPriorityFilter')?.value || '';

    const filtered = adminJobsData.filter(j => {
        const matchSearch = (j.request_code || '').toLowerCase().includes(search) ||
                            (j.user_name || '').toLowerCase().includes(search) ||
                            (j.building_room || '').toLowerCase().includes(search) ||
                            (j.category || '').toLowerCase().includes(search) ||
                            (j.description || '').toLowerCase().includes(search);
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

async function openViewJobModal(jobId) {
    const res = await apiFetch(`/requests/${jobId}`);
    if (res.success && res.data) {
        currentViewingJob = res.data;
        const j = res.data;

        document.getElementById('vJobCode').innerText = j.request_code;
        document.getElementById('vJobCategory').innerText = j.category;
        document.getElementById('vJobDescription').innerText = j.description;
        document.getElementById('vJobUserName').innerText = j.user_name || '-';
        document.getElementById('vJobRoom').innerText = j.building_room || '-';
        document.getElementById('vJobPhone').innerText = j.resident_phone || '081-234-5678';
        document.getElementById('vJobDate').innerText = new Date(j.created_at).toLocaleString('th-TH');
        
        document.getElementById('vJobStatusSelect').value = j.status;
        document.getElementById('vJobTechName').value = j.tech_name || 'ยังไม่ได้มอบหมายช่าง';
        document.getElementById('vJobTechNote').value = j.tech_note || '';

        const mediaContainer = document.getElementById('vJobMediaContainer');
        if (mediaContainer) {
            let mediaHtml = '';
            if (j.image_url) {
                mediaHtml += `<div class="mb-2"><small class="text-muted d-block mb-1">รูปภาพแนบ:</small><img src="${j.image_url}" class="img-fluid rounded border shadow-sm" style="max-height: 200px;" alt="รูปภาพปัญหา"></div>`;
            }
            if (j.video_url) {
                mediaHtml += `<div><small class="text-muted d-block mb-1">วิดีโอแนบ:</small><video src="${j.video_url}" controls class="w-100 rounded border" style="max-height: 200px;"></video></div>`;
            }
            mediaContainer.innerHTML = mediaHtml;
        }

        new bootstrap.Modal(document.getElementById('viewJobModal')).show();
    }
}

async function saveJobStatusFromModal() {
    if (!currentViewingJob) return;
    const newStatus = document.getElementById('vJobStatusSelect').value;
    const techNote = document.getElementById('vJobTechNote').value;

    const res = await apiFetch(`/requests/${currentViewingJob.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, tech_note: techNote })
    });

    bootstrap.Modal.getInstance(document.getElementById('viewJobModal')).hide();

    if (res.success) {
        Swal.fire('สำเร็จ!', `อัปเดตสถานะเป็น [${newStatus}] เรียบร้อยแล้ว`, 'success').then(() => {
            fetchAndRenderAdminJobs();
            fetchAndRenderAdminDashboard();
        });
    }
}

function reassignFromViewModal() {
    if (!currentViewingJob) return;
    bootstrap.Modal.getInstance(document.getElementById('viewJobModal')).hide();
    openAssignModal(currentViewingJob.id, currentViewingJob.request_code, currentViewingJob.category);
}

async function deleteJobFromViewModal() {
    if (!currentViewingJob) return;
    bootstrap.Modal.getInstance(document.getElementById('viewJobModal')).hide();
    deleteRepairRequest(currentViewingJob.id, currentViewingJob.request_code);
}

async function deleteRepairRequest(id, code) {
    const confirm = await Swal.fire({
        title: 'ยืนยันการลบรายการ?',
        text: `คุณต้องการลบรายการแจ้งซ่อม ${code || id} ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (confirm.isConfirmed) {
        const res = await apiFetch(`/requests/${id}`, { method: 'DELETE' });
        if (res.success) {
            Swal.fire('ลบสำเร็จ!', 'ลบรายการแจ้งซ่อมเรียบร้อยแล้ว', 'success').then(() => {
                fetchAndRenderAdminJobs();
                fetchAndRenderAdminDashboard();
            });
        }
    }
}

// ----------------------------------------------------
// 2. ADMIN: TECHNICIANS MANAGEMENT
// ----------------------------------------------------
let adminTechsData = [];

async function fetchAndRenderAdminTechs() {
    const res = await apiFetch('/technicians');
    const container = document.getElementById('techsCardGrid');
    if (!container) return;

    if (res.success && res.data) {
        adminTechsData = res.data;
        if (document.getElementById('adminInhouseTechCount')) {
            document.getElementById('adminInhouseTechCount').innerText = `${adminTechsData.length} คน`;
        }

        if (adminTechsData.length === 0) {
            container.innerHTML = `<div class="col-12 text-center text-muted py-4">ยังไม่มีรายชื่อช่างประจำหอพัก</div>`;
            return;
        }

        container.innerHTML = adminTechsData.map(t => `
            <div class="col-md-6 col-lg-4">
                <div class="glass-card p-4 text-center h-100 position-relative">
                    <button class="btn btn-sm btn-outline-danger position-absolute top-0 end-0 m-3" onclick="deleteTechnician(${t.id}, '${t.name}')" title="ลบช่าง">
                        <i class="bi bi-trash"></i>
                    </button>
                    <div class="bg-primary text-white rounded-circle fs-3 mx-auto mb-3 d-flex align-items-center justify-content-center shadow-sm" style="width:64px; height:64px;">
                        <i class="bi bi-person-badge"></i>
                    </div>
                    <h5 class="fw-bold mb-1">${t.name}</h5>
                    <span class="badge bg-info-subtle text-info mb-3">${t.specialty || 'ช่างซ่อมทั่วไป'}</span>
                    <div class="text-start bg-light p-3 rounded-3 small lh-lg border">
                        <div><i class="bi bi-telephone text-primary me-2"></i><strong>เบอร์โทร:</strong> <a href="tel:${t.phone || ''}" class="text-dark">${t.phone || '-'}</a></div>
                        <div><i class="bi bi-envelope text-primary me-2"></i><strong>อีเมล:</strong> ${t.email || '-'}</div>
                        <div><i class="bi bi-tools text-primary me-2"></i><strong>งานที่กำลังทำ:</strong> <span class="badge ${t.active_jobs > 0 ? 'bg-warning text-dark' : 'bg-success'}">${t.active_jobs > 0 ? `${t.active_jobs} งาน` : 'พร้อมรับงาน'}</span></div>
                    </div>
                </div>
            </div>
        `).join('');

        // Populate in-house dropdown in assignModal
        const techSelect = document.getElementById('inhouseTechSelect');
        if (techSelect && adminTechsData.length > 0) {
            techSelect.innerHTML = adminTechsData.map(t => `
                <option value="${t.id}">${t.name} (${t.specialty || 'ช่างซ่อมบำรุง'})</option>
            `).join('');
        }
    }
}

async function loadPartnerTechniciansAdmin() {
    const list = document.getElementById('adminPartnerTechsList');
    if (!list) return;

    const res = await apiFetch('/matching/partners');
    let partners = [
        { name: 'ช่างอำนาจ ประปาด่วน (ฟรีแลนซ์)', skills: 'ประปา / ท่อน้ำ', distance_km: 1.2, rating_score: 4.9, jobs_done: 87, price_estimate: '300 - 500 บาท' },
        { name: 'ช่างกิตติพงษ์ ไฟฟ้าด่วน (พาร์ทเนอร์)', skills: 'ไฟฟ้า / หลอดไฟ', distance_km: 0.8, rating_score: 4.9, jobs_done: 95, price_estimate: '350 - 600 บาท' },
        { name: 'ช่างธีระ แอร์คอนดิชั่น (พาร์ทเนอร์)', skills: 'เครื่องปรับอากาศ', distance_km: 1.5, rating_score: 4.9, jobs_done: 140, price_estimate: '500 - 800 บาท' },
        { name: 'ช่างสมนึก เน็ตเวิร์ก & Wi-Fi', skills: 'อินเทอร์เน็ต / Wi-Fi', distance_km: 1.8, rating_score: 4.9, jobs_done: 52, price_estimate: '300 - 500 บาท' },
        { name: 'ช่างประเสริฐ งานประตู/ลูกบิด', skills: 'เฟอร์นิเจอร์ / ประตู', distance_km: 2.0, rating_score: 4.8, jobs_done: 48, price_estimate: '300 - 450 บาท' }
    ];

    if (res.success && res.data && res.data.length > 0) {
        partners = res.data;
    }

    list.innerHTML = partners.map(p => `
        <div class="list-group-item d-flex justify-content-between align-items-center p-3 border-bottom">
            <div>
                <h6 class="fw-bold mb-1">${p.name} <span class="badge bg-success-subtle text-success ms-1">พาร์ทเนอร์ยืนยันแล้ว</span></h6>
                <div class="small text-muted">
                    ความชำนาญ: <span class="badge bg-primary-subtle text-primary">${p.skills}</span> | 
                    ระยะทาง: <strong>${p.distance_km} กม.</strong> | 
                    ⭐ ${p.rating_score} (${p.jobs_done} งาน) | 
                    ราคาประเมิน: <strong>${p.price_estimate || '300-500 บาท'}</strong>
                </div>
            </div>
            <a href="tel:${p.phone || '089-111-8888'}" class="btn btn-sm btn-outline-primary"><i class="bi bi-telephone me-1"></i>โทรติดต่อ</a>
        </div>
    `).join('');
}

function openAddTechModal() {
    if(document.getElementById('newTechName')) document.getElementById('newTechName').value = '';
    if(document.getElementById('newTechSpecialty')) document.getElementById('newTechSpecialty').value = '';
    if(document.getElementById('newTechPhone')) document.getElementById('newTechPhone').value = '';
    new bootstrap.Modal(document.getElementById('addTechModal')).show();
}

async function confirmAddTech() {
    const name = document.getElementById('newTechName')?.value;
    const specialty = document.getElementById('newTechSpecialty')?.value;
    const phone = document.getElementById('newTechPhone')?.value;

    if (!name || !phone) {
        Swal.fire('ข้อผิดพลาด', 'กรุณากรอกชื่อและเบอร์โทรศัพท์ช่าง', 'warning');
        return;
    }

    const res = await apiFetch('/technicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, specialty, phone })
    });

    bootstrap.Modal.getInstance(document.getElementById('addTechModal')).hide();

    if (res.success) {
        Swal.fire('สำเร็จ!', `เพิ่มข้อมูลช่าง ${name} เข้าสู่ระบบแล้ว`, 'success').then(() => {
            fetchAndRenderAdminTechs();
        });
    } else {
        Swal.fire('ข้อผิดพลาด', res.message || 'ไม่สามารถเพิ่มข้อมูลได้', 'error');
    }
}

async function deleteTechnician(id, name) {
    const confirm = await Swal.fire({
        title: 'ยืนยันการลบช่าง?',
        text: `คุณต้องการลบข้อมูลช่าง [${name}] ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (confirm.isConfirmed) {
        const res = await apiFetch(`/technicians/${id}`, { method: 'DELETE' });
        if (res.success) {
            Swal.fire('ลบสำเร็จ!', 'ลบข้อมูลช่างเรียบร้อยแล้ว', 'success').then(() => {
                fetchAndRenderAdminTechs();
            });
        }
    }
}

// ----------------------------------------------------
// 3. ADMIN: RESIDENTS MANAGEMENT
// ----------------------------------------------------
let adminResidentsData = [];

async function fetchAndRenderAdminResidents() {
    const res = await apiFetch('/residents');
    const tbody = document.querySelector('#residentsTable tbody');
    if (!tbody) return;

    if (res.success && res.data) {
        adminResidentsData = res.data;
        
        // Update counters
        const total = adminResidentsData.length;
        const bldgA = adminResidentsData.filter(r => (r.building || '').includes('A')).length;
        const bldgB = adminResidentsData.filter(r => (r.building || '').includes('B')).length;

        if (document.getElementById('adminResidentTotalCount')) document.getElementById('adminResidentTotalCount').innerText = `${total} คน`;
        if (document.getElementById('adminResidentBldgACount')) document.getElementById('adminResidentBldgACount').innerText = `${bldgA} ห้อง`;
        if (document.getElementById('adminResidentBldgBCount')) document.getElementById('adminResidentBldgBCount').innerText = `${bldgB} ห้อง`;

        renderAdminResidentsTable(adminResidentsData);
    }
}

function renderAdminResidentsTable(residents) {
    const tbody = document.querySelector('#residentsTable tbody');
    if (!tbody) return;

    if (residents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">ไม่พบข้อมูลผู้พักอาศัย</td></tr>`;
        return;
    }

    tbody.innerHTML = residents.map((r, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td><strong>${r.name}</strong></td>
            <td><span class="badge bg-secondary-subtle text-dark"><i class="bi bi-door-open me-1"></i>${r.room} - ${r.building}</span></td>
            <td>${r.phone ? `<a href="tel:${r.phone}" class="text-decoration-none"><i class="bi bi-telephone me-1"></i>${r.phone}</a>` : '<span class="text-muted">-</span>'}</td>
            <td>${r.email}</td>
            <td><span class="badge bg-primary-subtle text-primary">${r.request_count || 0} ครั้ง</span></td>
            <td><small>${new Date(r.created_at).toLocaleDateString('th-TH')}</small></td>
            <td>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteResident(${r.id}, '${r.name}')" title="ลบข้อมูลผู้พัก">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function filterAdminResidents() {
    const search = (document.getElementById('adminResidentSearch')?.value || '').toLowerCase();
    const bldg = document.getElementById('adminResidentBldgFilter')?.value || '';

    const filtered = adminResidentsData.filter(r => {
        const matchSearch = (r.name || '').toLowerCase().includes(search) ||
                            (r.room || '').toLowerCase().includes(search) ||
                            (r.phone || '').toLowerCase().includes(search) ||
                            (r.email || '').toLowerCase().includes(search);
        const matchBldg = !bldg || (r.building || '').includes(bldg);
        return matchSearch && matchBldg;
    });

    renderAdminResidentsTable(filtered);
}

function resetAdminResidentFilters() {
    if(document.getElementById('adminResidentSearch')) document.getElementById('adminResidentSearch').value = '';
    if(document.getElementById('adminResidentBldgFilter')) document.getElementById('adminResidentBldgFilter').value = '';
    renderAdminResidentsTable(adminResidentsData);
}

function openAddResidentModal() {
    if(document.getElementById('newResidentName')) document.getElementById('newResidentName').value = '';
    if(document.getElementById('newResidentRoom')) document.getElementById('newResidentRoom').value = '';
    if(document.getElementById('newResidentPhone')) document.getElementById('newResidentPhone').value = '';
    if(document.getElementById('newResidentEmail')) document.getElementById('newResidentEmail').value = '';
    new bootstrap.Modal(document.getElementById('addResidentModal')).show();
}

async function confirmAddResident() {
    const name = document.getElementById('newResidentName')?.value;
    const building = document.getElementById('newResidentBuilding')?.value || 'อาคาร A';
    const room = document.getElementById('newResidentRoom')?.value;
    const phone = document.getElementById('newResidentPhone')?.value;
    const email = document.getElementById('newResidentEmail')?.value;
    const password = document.getElementById('newResidentPassword')?.value || '123456';

    if (!name || !email || !room) {
        Swal.fire('ข้อผิดพลาด', 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'warning');
        return;
    }

    const res = await apiFetch('/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, building, room, phone, email, password })
    });

    bootstrap.Modal.getInstance(document.getElementById('addResidentModal')).hide();

    if (res.success) {
        Swal.fire('สำเร็จ!', `เพิ่มข้อมูลผู้พักอาศัย ${name} เรียบร้อยแล้ว`, 'success').then(() => {
            fetchAndRenderAdminResidents();
        });
    } else {
        Swal.fire('ข้อผิดพลาด', res.message || 'ไม่สามารถเพิ่มผู้พักได้', 'error');
    }
}

async function deleteResident(id, name) {
    const confirm = await Swal.fire({
        title: 'ยืนยันการลบผู้พักอาศัย?',
        text: `คุณต้องการลบข้อมูล [${name}] ออกจากระบบใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (confirm.isConfirmed) {
        const res = await apiFetch(`/residents/${id}`, { method: 'DELETE' });
        if (res.success) {
            Swal.fire('ลบสำเร็จ!', 'ลบข้อมูลผู้พักอาศัยเรียบร้อยแล้ว', 'success').then(() => {
                fetchAndRenderAdminResidents();
            });
        }
    }
}

// ----------------------------------------------------
// 4. ADMIN: ANNOUNCEMENTS MANAGEMENT
// ----------------------------------------------------
async function fetchAndRenderAdminAnnouncements() {
    const res = await apiFetch('/announcements');
    const list = document.getElementById('adminAnnouncementsList');
    if (!list) return;

    if (res.success && res.data) {
        if (res.data.length === 0) {
            list.innerHTML = `<div class="text-center text-muted py-4">ยังไม่มีประกาศข่าวสาร</div>`;
            return;
        }

        list.innerHTML = res.data.map(a => `
            <div class="glass-card p-3 border-start border-primary border-4 bg-white rounded-3 shadow-sm position-relative">
                <button class="btn btn-sm btn-outline-danger position-absolute top-0 end-0 m-3" onclick="deleteAnnouncement(${a.id}, '${a.title}')" title="ลบประกาศ">
                    <i class="bi bi-trash"></i>
                </button>
                <div class="d-flex align-items-center gap-2 mb-1">
                    <span class="badge bg-primary-subtle text-primary">ประกาศ</span>
                    <small class="text-muted"><i class="bi bi-calendar3 me-1"></i>${new Date(a.created_at).toLocaleDateString('th-TH')}</small>
                </div>
                <h5 class="fw-bold mb-2 text-dark">${a.title}</h5>
                <p class="text-secondary small mb-2">${a.content}</p>
                <small class="text-muted"><i class="bi bi-person-circle me-1"></i>ผู้ประกาศ: ${a.author}</small>
            </div>
        `).join('');
    }
}

async function submitAnnouncement() {
    const title = document.getElementById('annTitle')?.value;
    const content = document.getElementById('annContent')?.value;
    const author = document.getElementById('annAuthor')?.value || 'ผู้ดูแลระบบ (Admin)';

    if (!title || !content) return;

    const res = await apiFetch('/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, author })
    });

    if (res.success) {
        document.getElementById('annTitle').value = '';
        document.getElementById('annContent').value = '';
        Swal.fire('สำเร็จ!', 'สร้างและส่งประกาศข่าวสารเรียบร้อยแล้ว', 'success').then(() => {
            fetchAndRenderAdminAnnouncements();
        });
    } else {
        Swal.fire('ข้อผิดพลาด', res.message || 'ไม่สามารถสร้างประกาศได้', 'error');
    }
}

async function deleteAnnouncement(id, title) {
    const confirm = await Swal.fire({
        title: 'ยืนยันการลบประกาศ?',
        text: `คุณต้องการลบประกาศ "${title}" ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (confirm.isConfirmed) {
        const res = await apiFetch(`/announcements/${id}`, { method: 'DELETE' });
        if (res.success) {
            Swal.fire('ลบสำเร็จ!', 'ลบประกาศเรียบร้อยแล้ว', 'success').then(() => {
                fetchAndRenderAdminAnnouncements();
            });
        }
    }
}

// ----------------------------------------------------
// 5. ADMIN: REPORTS & ANALYTICS CHARTS
// ----------------------------------------------------
let adminStatsChart1 = null, adminStatsChart2 = null;

async function initAdminStatsCharts() {
    const ctx1 = document.getElementById('adminStatsMonthlyChart');
    const ctx2 = document.getElementById('adminStatsCatChart');

    const res = await apiFetch('/stats/dashboard');
    let cats = { 'ประปา': 4, 'ไฟฟ้า': 3, 'เครื่องปรับอากาศ': 2, 'อินเทอร์เน็ต': 1, 'เฟอร์นิเจอร์': 1 };
    
    if (res.success && res.data) {
        cats = res.data.categories || cats;
        const total = res.data.total || 10;
        const completed = res.data.completed || 8;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 100;
        if(document.getElementById('statsKpiCompleteRate')) document.getElementById('statsKpiCompleteRate').innerText = `${rate}%`;
    }

    if (ctx1) {
        if (adminStatsChart1) adminStatsChart1.destroy();
        adminStatsChart1 = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.'],
                datasets: [{
                    label: 'เคสที่ได้รับ (เคส)',
                    data: [12, 19, 15, 25, 22, 30, 28],
                    backgroundColor: '#2563EB',
                    borderRadius: 8
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    }

    if (ctx2) {
        if (adminStatsChart2) adminStatsChart2.destroy();
        const catLabels = Object.keys(cats).length > 0 ? Object.keys(cats) : ['ประปา', 'ไฟฟ้า', 'แอร์', 'Wi-Fi', 'เฟอร์นิเจอร์'];
        const catValues = Object.keys(cats).length > 0 ? Object.values(cats) : [4, 3, 2, 1, 1];

        adminStatsChart2 = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: catLabels,
                datasets: [{
                    data: catValues,
                    backgroundColor: ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#64748B']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

// ----------------------------------------------------
// ON-DEMAND PARTNER MATCHING HELPERS
// ----------------------------------------------------
async function loadPartnerTechnicians() {
    const list = document.getElementById('partnerTechsList');
    if (!list) return;

    const catParam = currentSelectedJobCategory ? `?category=${encodeURIComponent(currentSelectedJobCategory)}` : '';
    const res = await apiFetch(`/matching/partners${catParam}`);
    
    let techData = [
        { name: 'ช่างอำนาจ ประปาด่วน (ฟรีแลนซ์)', skills: 'ประปา / ท่อน้ำ', distance_km: 1.2, rating_score: 4.9, jobs_done: 87 },
        { name: 'ช่างกิตติพงษ์ ไฟฟ้าด่วน (พาร์ทเนอร์)', skills: 'ไฟฟ้า / หลอดไฟ', distance_km: 0.8, rating_score: 4.9, jobs_done: 95 },
        { name: 'ช่างธีระ แอร์คอนดิชั่น (พาร์ทเนอร์)', skills: 'เครื่องปรับอากาศ', distance_km: 1.5, rating_score: 4.9, jobs_done: 140 },
        { name: 'ช่างสมนึก เน็ตเวิร์ก & Wi-Fi', skills: 'อินเทอร์เน็ต / Wi-Fi', distance_km: 1.8, rating_score: 4.9, jobs_done: 52 },
        { name: 'ช่างประเสริฐ งานประตู/ลูกบิด', skills: 'เฟอร์นิเจอร์ / ประตู', distance_km: 2.0, rating_score: 4.8, jobs_done: 48 }
    ];

    if (res.success && res.data && res.data.length > 0) {
        techData = res.data;
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

// ----------------------------------------------------
// TECHNICIAN: DASHBOARD
// ----------------------------------------------------
async function fetchAndRenderTechDashboard() {
    const container = document.getElementById('techJobsContainer');
    if (!container) return;

    const res = await apiFetch(`/requests?tech_id=${currentUser.id || 3}`);
    
    let jobs = [];
    if (res.success && res.data && res.data.length > 0) {
        jobs = res.data.filter(j => j.status === 'assigned' || j.status === 'in_progress');
    }

    if (jobs.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="glass-card p-5 text-center text-muted">
                    <i class="bi bi-check2-all fs-1 text-success mb-3 d-block"></i>
                    <h5>ไม่มีงานที่ต้องดำเนินการในขณะนี้</h5>
                    <p class="small">เมื่อผู้ดูแลมอบหมายงาน จะแสดงที่นี่</p>
                </div>
            </div>`;
        return;
    }

    container.innerHTML = jobs.map(j => `
        <div class="col-md-6">
            <div class="glass-card p-4 border-start border-${j.priority === 'urgent' ? 'danger' : j.status === 'in_progress' ? 'info' : 'warning'} border-4">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    ${getPriorityBadge(j.priority)}
                    <small class="text-muted">${new Date(j.created_at).toLocaleDateString('th-TH')}</small>
                </div>
                <h5 class="fw-bold">${j.building_room}: ${j.category}</h5>
                <p class="text-muted small">${j.description}</p>
                <small class="text-muted d-block mb-3"><i class="bi bi-person me-1"></i>${j.user_name || '-'}</small>
                <hr>
                <div class="d-flex gap-2">
                    ${j.status === 'assigned'
                        ? `<button class="btn btn-sm btn-success w-100" onclick="updateTechStatus('start', ${j.id})"><i class="bi bi-play-circle me-1"></i>เริ่มเข้าซ่อม</button>`
                        : `<button class="btn btn-sm btn-outline-primary w-100" onclick="updateTechStatus('finish', ${j.id})"><i class="bi bi-check-circle me-1"></i>ปิดงานซ่อม</button>`
                    }
                </div>
            </div>
        </div>
    `).join('');
}

