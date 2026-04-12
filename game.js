const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const btns = {
    weapon: document.getElementById('btn-weapon'),
    shelter: document.getElementById('btn-shelter'),
    intel: document.getElementById('btn-intel'),
    uni: document.getElementById('btn-uni'),
    baby: document.getElementById('btn-baby'),
    weaponText: document.getElementById('btn-weapon').querySelector('.btn-text')
};

let isPlaying = false;
let isPaused = false;
let currentStage = 1;
let score = 0;
let frames = 0;
let framesInCurrentStage = 0; 
const FRAMES_PER_STAGE = 1400; // מעבר שלב לפי זמן מוקצב

let currentAction = 'idle'; 

let weaponState = 'idle'; let reloadTimer = null;
let studySubState = 'idle'; let studyOpenTimer = 0;
let babySubState = 'idle'; let babyActionTimer = 0;
let workSubState = 'idle'; let workOpenTimer = 0;

let isSirenActive = false; let sirenTimer = 0;
let isLectureActive = false; let participationMark = { active: false, timer: 0 };
let babyNeedsAttention = false; let babyTimer = 0;
let workEventActive = false; let workSqlType = 1; let workTimer = 0;

let targets = [];
let incomingMissile = null;
let interceptMissile = null;
let particles = [];

// ---- מערכת סטטיסטיקות וסיכום ----
let stats = {
    targets: { total: 0, success: 0 },
    missiles: { total: 0, success: 0 },
    lectures: { total: 0, success: 0 },
    baby: { total: 0, success: 0 },
    work: { total: 0, success: 0 }
};

let stage5Counters = { missiles: 0, lectures: 0, baby: 0, work: 0 };


// ================= מחלקות עזר =================
class Target {
    constructor() {
        this.x = Math.random() * (canvas.width - 120) + 60; 
        this.y = canvas.height - 120;
        this.radius = 25; this.speed = 1.5; 
        this.maxHeight = Math.random() * 80 + 80;
        this.state = 'rising'; this.timer = 120; 
    }
    update() {
        if (this.state === 'rising') { this.y -= this.speed; if (this.y <= this.maxHeight) this.state = 'waiting'; } 
        else if (this.state === 'waiting') { this.timer--; if (this.timer <= 0) this.state = 'falling'; } 
        else if (this.state === 'falling') { this.y += this.speed; }
    }
    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#34495e'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = 'white'; ctx.stroke();
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius - 10, 0, Math.PI * 2); ctx.fillStyle = '#e74c3c'; ctx.fill();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.vx = (Math.random() - 0.5) * 10; this.vy = (Math.random() - 0.5) * 10;
        this.life = 1.0; this.color = color;
    }
    update() { this.x += this.vx; this.y += this.vy; this.life -= 0.05; }
    draw() {
        ctx.globalAlpha = Math.max(0, this.life); ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0;
    }
}

function createExplosion(x, y, color) { for(let i=0; i<15; i++) particles.push(new Particle(x, y, color)); }

function clearAllEvents() {
    isSirenActive = false; incomingMissile = null; interceptMissile = null;
    isLectureActive = false; participationMark.active = false;
    babyNeedsAttention = false; babySubState = 'idle';
    workEventActive = false; workSubState = 'idle';
    targets = [];
}

// ================= פונקציות ציור =================

function drawEnvironment() {
    ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, canvas.width, canvas.height); 
    if (isSirenActive && (Math.floor(Date.now() / 300) % 2 === 0)) { 
        ctx.fillStyle = 'rgba(231, 76, 60, 0.3)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.fillStyle = '#27ae60'; ctx.fillRect(0, canvas.height - 100, canvas.width, 100); 
    ctx.fillStyle = '#c0392b'; ctx.fillRect(0, canvas.height - 120, canvas.width, 120); 
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; 
    for(let y = canvas.height - 120; y < canvas.height; y += 30) {
        ctx.fillRect(0, y, canvas.width, 2);
        for(let x = (y % 60 === 0 ? 0 : 40); x < canvas.width; x += 80) ctx.fillRect(x, y, 2, 30);
    }
}

function drawMissiles() {
    if (incomingMissile) {
        ctx.save(); ctx.translate(incomingMissile.x, incomingMissile.y); ctx.rotate(Math.PI);
        ctx.fillStyle = '#bdc3c7'; ctx.fillRect(-6, 0, 12, 30);
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.moveTo(-6, 30); ctx.lineTo(6, 30); ctx.lineTo(0, 45); ctx.fill();
        ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.moveTo(-6, 5); ctx.lineTo(-12, -5); ctx.lineTo(-6, 0); ctx.fill();
        ctx.beginPath(); ctx.moveTo(6, 5); ctx.lineTo(12, -5); ctx.lineTo(6, 0); ctx.fill(); ctx.restore();
    }
    if (interceptMissile) {
        ctx.save(); ctx.translate(interceptMissile.x, interceptMissile.y);
        const angle = Math.atan2(interceptMissile.targetY - interceptMissile.y, interceptMissile.targetX - interceptMissile.x);
        ctx.rotate(angle + Math.PI/2);
        ctx.fillStyle = '#ecf0f1'; ctx.fillRect(-6, 0, 12, 30);
        ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.moveTo(-6, 30); ctx.lineTo(6, 30); ctx.lineTo(0, 45); ctx.fill();
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(0, -5, 6, 0, Math.PI*2); ctx.fill(); ctx.restore();
    }
}

function drawCharacterAndTools() {
    ctx.fillStyle = '#2980b9'; ctx.fillRect(canvas.width/2 - 25, canvas.height - 170, 50, 60); 
    ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(canvas.width/2, canvas.height - 190, 25, 0, Math.PI*2); ctx.fill();

    if (currentAction === 'weapon') {
        if (weaponState === 'ready') {
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(canvas.width/2 + 25, canvas.height - 130, 60, 10); ctx.fillRect(canvas.width/2 + 75, canvas.height - 130, 5, -15);
        } else if (weaponState === 'reloading') {
            ctx.fillStyle = 'white'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('טוען...', canvas.width/2, canvas.height - 225);
        }
    } 
    else if (currentAction === 'shelter') {
        ctx.fillStyle = 'rgba(52, 152, 219, 0.2)'; ctx.strokeStyle = '#3498db'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(canvas.width/2, canvas.height - 120, 80, Math.PI, 0); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#7f8c8d'; ctx.fillRect(canvas.width/2 + 30, canvas.height - 110, 40, 20); 
        ctx.fillStyle = '#2c3e50'; 
        ctx.save(); ctx.translate(canvas.width/2 + 50, canvas.height - 110); ctx.rotate(-Math.PI/6);
        ctx.fillRect(-15, -25, 30, 25); 
        ctx.restore();
    }
    else if (currentAction === 'study') {
        ctx.fillStyle = '#bdc3c7'; ctx.fillRect(canvas.width/2 + 10, canvas.height - 140, 50, 35);
        ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.moveTo(canvas.width/2 + 5, canvas.height - 105); ctx.lineTo(canvas.width/2 + 65, canvas.height - 105); ctx.lineTo(canvas.width/2 + 75, canvas.height - 95); ctx.lineTo(canvas.width/2 - 5, canvas.height - 95); ctx.fill();
        if (studySubState === 'opening') {
            ctx.fillStyle = '#2ecc71'; ctx.fillRect(canvas.width/2 + 15, canvas.height - 125, 40 * (1 - studyOpenTimer/120), 5);
        } else if (studySubState === 'active') {
            ctx.fillStyle = '#2980b9'; ctx.fillRect(canvas.width/2 + 12, canvas.height - 138, 46, 31);
        }
        if (participationMark.active && studySubState === 'active') {
            ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(canvas.width/2 + 35, canvas.height - 165, 18, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center'; ctx.fillText('!', canvas.width/2 + 35, canvas.height - 156);
        }
    }
    else if (currentAction === 'baby') {
        ctx.fillStyle = '#ffb8b8'; ctx.fillRect(canvas.width/2 + 10, canvas.height - 140, 60, 40);
        ctx.fillStyle = '#dcdde1'; ctx.beginPath(); ctx.arc(canvas.width/2 + 40, canvas.height - 130, 15, 0, Math.PI*2); ctx.fill();
        
        if (babySubState === 'changing') {
            ctx.fillStyle = 'white'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('מחליף...', canvas.width/2 + 40, canvas.height - 160);
        } else if (babyNeedsAttention) {
            ctx.font = '30px Arial'; ctx.fillText('💩', canvas.width/2 + 40, canvas.height - 150); 
        }
    }
    else if (currentAction === 'work') {
        ctx.fillStyle = '#34495e'; ctx.fillRect(canvas.width/2 + 10, canvas.height - 160, 40, 55); 
        ctx.fillRect(canvas.width/2 + 60, canvas.height - 160, 40, 55); 
        
        if (workSubState === 'opening') {
            ctx.fillStyle = '#00b894'; ctx.fillRect(canvas.width/2 + 35, canvas.height - 100, 40 * (1 - workOpenTimer/90), 5);
        } else if (workSubState === 'active' && workEventActive) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; ctx.shadowColor = 'black'; ctx.shadowBlur = 10;
            ctx.fillRect(canvas.width/2 - 100, canvas.height - 280, 280, 100); ctx.shadowBlur = 0;
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(canvas.width/2 - 100, canvas.height - 280, 280, 20); 
            
            ctx.fillStyle = '#2c3e50'; ctx.font = '14px Courier New'; ctx.textAlign = 'left';
            ctx.fillText(`SQL> SELECT * FROM Table_${workSqlType};`, canvas.width/2 - 90, canvas.height - 240);
            ctx.fillText(`Awaiting input...`, canvas.width/2 - 90, canvas.height - 220);

            ctx.fillStyle = '#ecf0f1'; ctx.fillRect(canvas.width/2 - 80, canvas.height - 210, 60, 20); 
            ctx.fillRect(canvas.width/2 + 80, canvas.height - 210, 60, 20); 
            ctx.fillStyle = '#c0392b'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
            ctx.fillText('Table 1', canvas.width/2 - 50, canvas.height - 195);
            ctx.fillText('Table 2', canvas.width/2 + 110, canvas.height - 195);
        }
    }
}

function drawHUD() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.fillRect(10, 10, 150, 40);
    ctx.fillStyle = 'white'; ctx.font = 'bold 20px "Segoe UI", sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`ניקוד: ${score}`, 145, 38);

    let alertY = 10; ctx.textAlign = 'center';
    if (isSirenActive) {
        ctx.fillStyle = (Math.floor(Date.now() / 400) % 2 === 0) ? '#e74c3c' : '#c0392b';
        ctx.fillRect(canvas.width / 2 - 100, alertY, 200, 40); ctx.fillStyle = 'white'; ctx.fillText('אזעקה! הפעל מגן!', canvas.width / 2, alertY + 28); alertY += 50;
    }
    if (isLectureActive) {
        ctx.fillStyle = '#2980b9'; ctx.fillRect(canvas.width / 2 - 100, alertY, 200, 40); ctx.fillStyle = 'white'; ctx.fillText('החלה הרצאה בזום', canvas.width / 2, alertY + 28); alertY += 50;
    }
    if (babyNeedsAttention) {
        ctx.fillStyle = '#e84393'; ctx.fillRect(canvas.width / 2 - 100, alertY, 200, 40); ctx.fillStyle = 'white'; ctx.fillText('עמית בוכה! טיטול!', canvas.width / 2, alertY + 28); alertY += 50;
    }
    if (workEventActive) {
        ctx.fillStyle = '#00b894'; ctx.fillRect(canvas.width / 2 - 100, alertY, 200, 40); ctx.fillStyle = 'white'; ctx.fillText('קריאה מאינטל (SQL)', canvas.width / 2, alertY + 28);
    }
    
    if (isPaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.fillText('מושהה', canvas.width/2, canvas.height/2);
    }
}

// ================= לוגיקת סיום ואיפוס =================

function triggerEndGame() {
    isPlaying = false;
    
    // בניית הסיכום
    const summaryHTML = `
        <p>🎯 מטרות שחיסלת: <span style="color:#2ecc71;">${stats.targets.success}</span> / ${stats.targets.total}</p>
        <p>🚀 טילים שיורטו: <span style="color:#2ecc71;">${stats.missiles.success}</span> / ${stats.missiles.total}</p>
        <p>🎓 שיעורי זום שהשתתפת: <span style="color:#2ecc71;">${stats.lectures.success}</span> / ${stats.lectures.total}</p>
        <p>🍼 טיטולים שהוחלפו: <span style="color:#2ecc71;">${stats.baby.success}</span> / ${stats.baby.total}</p>
        <p>💻 פתרונות SQL שסגרת: <span style="color:#2ecc71;">${stats.work.success}</span> / ${stats.work.total}</p>
    `;
    
    document.getElementById('summary-stats').innerHTML = summaryHTML;
    document.getElementById('final-score').innerText = `ניקוד סופי: ${score}`;
    document.getElementById('summary-modal').style.display = 'flex';
}

document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('summary-modal').style.display = 'none';
    
    // איפוס מלא של כל הנתונים
    score = 0; frames = 0; framesInCurrentStage = 0; currentStage = 1;
    stats = { targets: {total:0, success:0}, missiles: {total:0, success:0}, lectures: {total:0, success:0}, baby: {total:0, success:0}, work: {total:0, success:0} };
    stage5Counters = { missiles: 0, lectures: 0, baby: 0, work: 0 };
    
    clearAllEvents();
    
    // איפוס כפתורים
    ['shelter', 'intel', 'uni', 'baby'].forEach(key => {
        btns[key].classList.add('disabled-btn');
        btns[key].disabled = true;
    });
    
    // חזרה למסך פתיחה
    document.getElementById('start-modal').style.display = 'flex';
});

// ================= לוגיקת אירועים ולחיצות =================

function setAction(action) {
    if (isPaused) return;
    currentAction = action;
    clearInterval(reloadTimer);
    
    Object.values(btns).forEach(btn => { if(btn.tagName === 'BUTTON') { btn.classList.remove('active-tool', 'btn-weapon-ready'); btn.style.backgroundColor = ''; } });

    if (action === 'weapon') {
        btns.weapon.classList.add('active-tool', 'btn-weapon-active'); weaponState = 'reloading';
        let timeLeft = 3; btns.weaponText.innerText = `טוען (${timeLeft})`; btns.weapon.style.backgroundColor = '#f39c12';
        reloadTimer = setInterval(() => {
            timeLeft--;
            if (timeLeft > 0) btns.weaponText.innerText = `טוען (${timeLeft})`;
            else { clearInterval(reloadTimer); weaponState = 'ready'; btns.weapon.style.backgroundColor = ''; btns.weapon.classList.add('btn-weapon-ready'); btns.weaponText.innerText = 'מוכן לירי!'; }
        }, 1000);
    } 
    else if (action === 'shelter') { btns.shelter.classList.add('active-tool', 'btn-shelter-active'); btns.weaponText.innerText = 'נשק'; }
    else if (action === 'study') { btns.uni.classList.add('active-tool', 'btn-uni-active'); studySubState = 'opening'; studyOpenTimer = 120; btns.weaponText.innerText = 'נשק'; }
    else if (action === 'baby') { btns.baby.classList.add('active-tool', 'btn-baby-active'); btns.weaponText.innerText = 'נשק'; }
    else if (action === 'work') { btns.intel.classList.add('active-tool', 'btn-work-active'); workSubState = 'opening'; workOpenTimer = 90; btns.weaponText.innerText = 'נשק'; }
}

document.getElementById('start-btn').addEventListener('click', () => { 
    document.getElementById('start-modal').style.display = 'none'; 
    isPlaying = true; btns.weapon.classList.remove('disabled-btn'); btns.weapon.disabled = false; 
    setAction('weapon'); requestAnimationFrame(gameLoop); 
});

document.querySelectorAll('.continue-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const stage = e.target.getAttribute('data-stage');
        document.getElementById(`stage${stage}-modal`).style.display = 'none'; 
        isPlaying = true;
        if(stage == 2) { btns.shelter.classList.remove('disabled-btn'); document.getElementById('info-s2').style.display = 'block'; }
        if(stage == 3) { btns.uni.classList.remove('disabled-btn'); btns.uni.disabled = false; document.getElementById('info-s3').style.display = 'block'; }
        if(stage == 4) { btns.baby.classList.remove('disabled-btn'); btns.baby.disabled = false; document.getElementById('info-s4').style.display = 'block'; }
        if(stage == 5) { btns.intel.classList.remove('disabled-btn'); btns.intel.disabled = false; document.getElementById('info-s5').style.display = 'block'; }
        setAction('weapon'); 
        requestAnimationFrame(gameLoop);
    });
});

btns.weapon.addEventListener('click', () => { if (currentAction !== 'weapon') setAction('weapon'); });
btns.shelter.addEventListener('click', () => { if (isSirenActive && currentAction !== 'shelter') setAction('shelter'); });
btns.uni.addEventListener('click', () => { if (currentAction !== 'study') setAction('study'); });
btns.baby.addEventListener('click', () => { if (currentAction !== 'baby') setAction('baby'); });
btns.intel.addEventListener('click', () => { if (currentAction !== 'work') setAction('work'); });

document.getElementById('btn-pause').addEventListener('click', () => { isPaused = !isPaused; document.getElementById('btn-pause').innerText = isPaused ? '▶️' : '⏸️'; });
document.getElementById('btn-info').addEventListener('click', () => { isPaused = true; document.getElementById('info-modal').style.display = 'flex'; });
document.getElementById('close-info-btn').addEventListener('click', () => { document.getElementById('info-modal').style.display = 'none'; isPaused = false; requestAnimationFrame(gameLoop); });

canvas.addEventListener('mousedown', (e) => {
    if (!isPlaying || isPaused) return;
    const rect = canvas.getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;

    if (currentAction === 'weapon' && weaponState === 'ready') {
        let hit = false;
        for (let i = targets.length - 1; i >= 0; i--) {
            if (Math.hypot(mouseX - targets[i].x, mouseY - targets[i].y) < targets[i].radius) {
                createExplosion(targets[i].x, targets[i].y, '#e74c3c'); targets.splice(i, 1); 
                score += 10; stats.targets.success++; hit = true; break;
            }
        }
        createExplosion(mouseX, mouseY, hit ? '#f1c40f' : '#bdc3c7'); 
    }
    
    if (currentAction === 'shelter' && incomingMissile && !interceptMissile) {
        if (mouseX > canvas.width/2 + 20 && mouseX < canvas.width/2 + 80 && mouseY > canvas.height - 140 && mouseY < canvas.height - 80) {
            interceptMissile = { x: canvas.width / 2 + 50, y: canvas.height - 110, targetX: incomingMissile.x, targetY: incomingMissile.y, speed: 8 };
        }
    }

    if (currentAction === 'study' && studySubState === 'active' && participationMark.active) {
        if (Math.hypot(mouseX - (canvas.width/2 + 35), mouseY - (canvas.height - 165)) < 25) {
            participationMark.active = false; score += 15; stats.lectures.success++; createExplosion(mouseX, mouseY, '#3498db');
        }
    }

    if (currentAction === 'baby' && babyNeedsAttention && babySubState !== 'changing') {
        if (mouseX > canvas.width/2 && mouseX < canvas.width/2 + 70 && mouseY > canvas.height - 160 && mouseY < canvas.height - 100) {
            babySubState = 'changing'; babyActionTimer = 90;
        }
    }

    if (currentAction === 'work' && workSubState === 'active' && workEventActive) {
        if (mouseX > canvas.width/2 - 80 && mouseX < canvas.width/2 - 20 && mouseY > canvas.height - 210 && mouseY < canvas.height - 190) {
            if (workSqlType === 1) { score += 20; stats.work.success++; createExplosion(mouseX, mouseY, '#00b894'); workEventActive = false; } else { score -= 10; }
        }
        else if (mouseX > canvas.width/2 + 80 && mouseX < canvas.width/2 + 140 && mouseY > canvas.height - 210 && mouseY < canvas.height - 190) {
            if (workSqlType === 2) { score += 20; stats.work.success++; createExplosion(mouseX, mouseY, '#00b894'); workEventActive = false; } else { score -= 10; }
        }
    }
});

// ================= לולאה מרכזית =================

function gameLoop() {
    if (!isPlaying) return;
    
    drawEnvironment(); 
    if (isPaused) { drawCharacterAndTools(); drawMissiles(); drawHUD(); return; }

    frames++;
    framesInCurrentStage++;

    // ---- בדיקת סיום המשחק (שלב 5: 4 מכל סוג) ----
    if (currentStage === 5 && stage5Counters.missiles >= 4 && stage5Counters.lectures >= 4 && stage5Counters.baby >= 4 && stage5Counters.work >= 4) {
        triggerEndGame();
        return; // עוצר את הלולאה
    }

    // מעברי שלב 1-4 (כל 40 שניות)
    if (currentStage === 1 && framesInCurrentStage > FRAMES_PER_STAGE) {
        isPlaying = false; currentStage = 2; framesInCurrentStage = 0; clearAllEvents(); document.getElementById('stage2-modal').style.display = 'flex';
    } 
    else if (currentStage === 2 && framesInCurrentStage > FRAMES_PER_STAGE) {
        isPlaying = false; currentStage = 3; framesInCurrentStage = 0; clearAllEvents(); document.getElementById('stage3-modal').style.display = 'flex';
    }
    else if (currentStage === 3 && framesInCurrentStage > FRAMES_PER_STAGE) {
        isPlaying = false; currentStage = 4; framesInCurrentStage = 0; clearAllEvents(); document.getElementById('stage4-modal').style.display = 'flex';
    }
    else if (currentStage === 4 && framesInCurrentStage > FRAMES_PER_STAGE) {
        isPlaying = false; currentStage = 5; framesInCurrentStage = 0; clearAllEvents(); document.getElementById('stage5-modal').style.display = 'flex';
    }

    // ---- ניהול אירועי מערכת ----
    
    // אזעקות
    if (currentStage >= 2 && !isSirenActive && Math.random() < 0.0015) { isSirenActive = true; sirenTimer = 600; btns.shelter.disabled = false; }
    if (isSirenActive) {
        sirenTimer--;
        if (sirenTimer <= 0) { isSirenActive = false; btns.shelter.disabled = true; incomingMissile = null; interceptMissile = null; if(currentAction === 'shelter') setAction('weapon'); }
        if (!incomingMissile && sirenTimer > 100 && Math.random() < 0.015) {
            incomingMissile = { x: Math.random() * (canvas.width - 60) + 30, y: -50, speed: 1.5 };
            stats.missiles.total++;
            if (currentStage === 5) stage5Counters.missiles++;
        }
    }

    // לימודים
    if (currentStage >= 3 && !isLectureActive && Math.random() < 0.001) { 
        isLectureActive = true; lectureTimer = 900; 
        stats.lectures.total++;
        if (currentStage === 5) stage5Counters.lectures++;
    } 
    if (isLectureActive) {
        lectureTimer--; if (lectureTimer <= 0) { isLectureActive = false; participationMark.active = false; }
        if (!participationMark.active && Math.random() < 0.01) { participationMark.active = true; participationMark.timer = 240; }
    }
    if (participationMark.active) {
        participationMark.timer--; if (participationMark.timer <= 0) { participationMark.active = false; score -= 10; }
    }
    if (currentAction === 'study' && studySubState === 'opening') { studyOpenTimer--; if (studyOpenTimer <= 0) studySubState = 'active'; }

    // תינוק 
    if (currentStage >= 4 && !babyNeedsAttention && Math.random() < 0.0015) { 
        babyNeedsAttention = true; babyTimer = 900; 
        stats.baby.total++;
        if (currentStage === 5) stage5Counters.baby++;
    } 
    if (babyNeedsAttention && babySubState !== 'changing') {
        babyTimer--;
        if (babyTimer <= 0) { babyNeedsAttention = false; score -= 20; }
    }
    if (babySubState === 'changing') {
        babyActionTimer--;
        if (babyActionTimer <= 0) { babySubState = 'idle'; babyNeedsAttention = false; score += 20; stats.baby.success++; }
    }

    // עבודה 
    if (currentStage >= 5 && !workEventActive && Math.random() < 0.0015) { 
        workEventActive = true; workSqlType = Math.random() > 0.5 ? 1 : 2; workTimer = 720; 
        stats.work.total++;
        stage5Counters.work++;
    } 
    if (workEventActive) {
        workTimer--; if (workTimer <= 0) { workEventActive = false; score -= 20; } 
    }
    if (currentAction === 'work' && workSubState === 'opening') { workOpenTimer--; if (workOpenTimer <= 0) workSubState = 'active'; }

    // מטרות 
    if (frames % 150 === 0) {
        targets.push(new Target()); 
        stats.targets.total++;
    }
    
    for (let i = targets.length - 1; i >= 0; i--) {
        targets[i].update(); if (targets[i].y > canvas.height) { targets.splice(i, 1); score -= 5; }
    }

    // ---- ציור עולם דינמי ----
    targets.forEach(t => t.draw());
    drawCharacterAndTools();

    if (incomingMissile) {
        incomingMissile.y += incomingMissile.speed;
        if (incomingMissile.y > canvas.height - 50) { score -= 50; createExplosion(incomingMissile.x, canvas.height - 50, '#e67e22'); incomingMissile = null; }
    }
    if (interceptMissile && incomingMissile) {
        const dx = incomingMissile.x - interceptMissile.x; const dy = incomingMissile.y - interceptMissile.y; const dist = Math.hypot(dx, dy);
        interceptMissile.x += (dx / dist) * interceptMissile.speed; interceptMissile.y += (dy / dist) * interceptMissile.speed;
        if (dist < 20) { createExplosion(interceptMissile.x, interceptMissile.y, '#f1c40f'); score += 50; stats.missiles.success++; incomingMissile = null; interceptMissile = null; }
    }
    drawMissiles();

    for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(); particles[i].draw(); if (particles[i].life <= 0) particles.splice(i, 1); }

    drawHUD();

    canvas.style.cursor = ((currentAction === 'weapon' && weaponState === 'ready') || (currentAction === 'shelter' && incomingMissile) || (currentAction === 'study' && participationMark.active) || (currentAction === 'baby' && babyNeedsAttention) || (currentAction === 'work' && workEventActive)) ? 'pointer' : 'default';

    requestAnimationFrame(gameLoop);
}
