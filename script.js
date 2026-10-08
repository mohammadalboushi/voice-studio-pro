import {
  Client
} from "https://esm.sh/@gradio/client";

let currentFile = null;
let audioContexts = {};

document.getElementById('cfg_agg').addEventListener('input', (e) => {
  document.getElementById('aggValue').innerText = e.target.value;
});

window.showToast = function(message, type = 'success') {
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-times-circle',
    warning: 'fa-exclamation-circle'
  };
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

window.showPage = function(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  window.scrollTo(0, 0);
}

window.handleDragOver = function(e) {
  e.preventDefault();
  document.getElementById('uploadArea').classList.add('dragover');
}

window.handleDragLeave = function(e) {
  document.getElementById('uploadArea').classList.remove('dragover');
}

window.handleDrop = function(e) {
  e.preventDefault();
  document.getElementById('uploadArea').classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    currentFile = e.dataTransfer.files[0];
    showFileInfo();
  }
}

window.handleFileSelect = function(e) {
  if (e.target.files.length > 0) {
    currentFile = e.target.files[0];
    showFileInfo();
  }
}

async function drawWaveform(file) {
  const canvas = document.getElementById('waveformCanvas');
  const ctx = canvas.getContext('2d');

  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#6366f1';
  ctx.font = 'bold 12px Cairo';
  ctx.fillText('جاري تحليل موجة الصوت...', 15, canvas.height / 2);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const actx = new(window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await actx.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0);

    const samples = 100;
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = [];
    for (let i = 0; i < samples; i++) {
      let blockStart = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[blockStart + j]);
      }
      filteredData.push(sum / blockSize);
    }

    const multiplier = Math.pow(Math.max(...filteredData), -1);
    const normalizedData = filteredData.map(n => n * multiplier);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / samples) - 2;

    normalizedData.forEach((val, i) => {
      const barHeight = Math.max(val * (canvas.height - 10), 4);
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#818cf8');
      gradient.addColorStop(1, '#6366f1');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(i * (barWidth + 2), (canvas.height - barHeight) / 2, barWidth, barHeight, 4);
      ctx.fill();
    });
  } catch (e) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillText('جاهز للمعالجة', 15, canvas.height / 2);
  }
}

function showFileInfo() {
  if (!currentFile) return;

  document.getElementById('fileName').innerText = currentFile.name.substring(0, 20) + '...';
  document.getElementById('fileSize').innerText = (currentFile.size / 1048576).toFixed(1) + ' MB';
  document.getElementById('fileInfo').classList.add('show');
  document.getElementById('settingsSection').classList.add('show');
  document.getElementById('waveformSection').classList.add('show');

  const audio = new Audio();
  audio.src = URL.createObjectURL(currentFile);
  audio.onloadedmetadata = () => {
    const minutes = Math.floor(audio.duration / 60);
    const seconds = Math.floor(audio.duration % 60);
    document.getElementById('fileDuration').innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  drawWaveform(currentFile);
}

// ====== MODAL PLAYER LOGIC ======
let activeAudio = null;
let activeType = null; // 'vocal' or 'inst'
let progressInterval = null;

window.openPlayer = function(type) {
  activeType = type;
  const audioId = type === 'vocal' ? 'vocalAudio' : 'instAudio';
  activeAudio = document.getElementById(audioId);

  if (!activeAudio.src || activeAudio.src === window.location.href) {
    showToast('الصوت غير متوفر أو لم يتم معالجته بعد', 'warning');
    return;
  }

  // Setup Modal UI
  document.getElementById('playerTitle').innerText = type === 'vocal' ? 'صوت المطرب' : 'الموسيقى الخلفية';
  document.getElementById('trackName').innerText = type === 'vocal' ? 'المسار الصوتي' : 'المسار الموسيقي';
  document.getElementById('trackFileName').innerText = currentFile ? currentFile.name : 'Unknown.mp3';
  
  const artwork = document.getElementById('playerArtwork');
  const icon = document.getElementById('playerArtworkIcon');
  
  artwork.className = 'player-artwork'; // Reset classes
  if (type === 'vocal') {
    artwork.classList.add('vocal-theme');
    icon.className = 'fas fa-microphone-alt';
  } else {
    artwork.classList.add('inst-theme');
    icon.className = 'fas fa-guitar';
  }

  // Initial time setup
  document.getElementById('modalSeek').value = activeAudio.currentTime ? (activeAudio.currentTime / activeAudio.duration) * 100 : 0;
  document.getElementById('modalCurrentTime').innerText = formatTime(activeAudio.currentTime || 0);
  document.getElementById('modalTotalTime').innerText = formatTime(activeAudio.duration || 0);

  // Sync Play/Pause Icon
  syncPlayPauseIcon();

  // Open Modal
  document.getElementById('playerModal').classList.add('open');
  
  // حفظ حالة في السجل لزر الرجوع
  history.pushState({ modalOpen: true }, '', '#player');

  // Start progress updater
  if(progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(updateModalProgress, 100);
}

window.closePlayer = function() {
  if (window.location.hash === '#player') {
    history.back(); // هذا سيفعل حدث popstate أدناه والذي سيغلق المشغل
  } else {
    document.getElementById('playerModal').classList.remove('open');
    if(progressInterval) clearInterval(progressInterval);
  }
}

// التقاط حدث زر الرجوع في الهاتف
window.addEventListener('popstate', function(event) {
  // إغلاق مشغل الصوت إذا كان مفتوح
  const playerModal = document.getElementById('playerModal');
  if (playerModal && playerModal.classList.contains('open')) {
    playerModal.classList.remove('open');
    if (progressInterval) clearInterval(progressInterval);
  }
  
  // إغلاق نافذة تأكيد المسح إذا كانت مفتوحة
  const confirmModal = document.getElementById('confirmModal');
  if (confirmModal && confirmModal.classList.contains('open')) {
    confirmModal.classList.remove('open');
  }
});

window.toggleModalPlay = function() {
  if (!activeAudio) return;

  const otherAudioId = activeAudio.id === 'vocalAudio' ? 'instAudio' : 'vocalAudio';
  const otherAudio = document.getElementById(otherAudioId);

  if (activeAudio.paused) {
    // إيقاف الصوت الآخر بتلاشي إذا كان شغال
    if (otherAudio && !otherAudio.paused) {
      clearInterval(otherAudio.fadeInterval);
      let otherVol = otherAudio.volume;
      otherAudio.fadeInterval = setInterval(() => {
        otherVol -= 0.1;
        if (otherVol > 0.05) {
          otherAudio.volume = otherVol;
        } else {
          clearInterval(otherAudio.fadeInterval);
          otherAudio.pause();
          otherAudio.volume = 1;
        }
      }, 40);
    }

    // تشغيل الصوت الحالي بتلاشي
    clearInterval(activeAudio.fadeInterval);
    activeAudio.volume = 0;
    activeAudio.play();
    let activeVol = 0;
    activeAudio.fadeInterval = setInterval(() => {
      activeVol += 0.1;
      if (activeVol < 0.95) {
        activeAudio.volume = activeVol;
      } else {
        clearInterval(activeAudio.fadeInterval);
        activeAudio.volume = 1;
      }
    }, 40);

  } else {
    // إيقاف الصوت الحالي بتلاشي
    clearInterval(activeAudio.fadeInterval);
    let currentVol = activeAudio.volume;
    activeAudio.fadeInterval = setInterval(() => {
      currentVol -= 0.1;
      if (currentVol > 0.05) {
        activeAudio.volume = currentVol;
      } else {
        clearInterval(activeAudio.fadeInterval);
        activeAudio.pause();
        activeAudio.volume = 1;
        syncPlayPauseIcon(); // تحديث الأيقونة الحقيقية بعد الإيقاف الفعلي
      }
    }, 40);

    // تغيير الأيقونة فوراً لتعطي شعور بالاستجابة السريعة للمستخدم
    const icon = document.querySelector('#modalPlayBtn i');
    const artwork = document.getElementById('playerArtwork');
    icon.className = 'fas fa-play';
    artwork.classList.remove('playing');
    return; 
  }
  syncPlayPauseIcon();
}

function syncPlayPauseIcon() {
  if (!activeAudio) return;
  const icon = document.querySelector('#modalPlayBtn i');
  const artwork = document.getElementById('playerArtwork');
  
  if (activeAudio.paused) {
    icon.className = 'fas fa-play';
    artwork.classList.remove('playing');
  } else {
    icon.className = 'fas fa-pause';
    artwork.classList.add('playing');
  }
}

window.seekModalAudio = function(val) {
  if (activeAudio && activeAudio.duration) {
    activeAudio.currentTime = (val / 100) * activeAudio.duration;
    document.getElementById('modalCurrentTime').innerText = formatTime(activeAudio.currentTime);
  }
}

window.seekRelative = function(seconds) {
  if (activeAudio && activeAudio.duration) {
    let newTime = activeAudio.currentTime + seconds;
    if(newTime < 0) newTime = 0;
    if(newTime > activeAudio.duration) newTime = activeAudio.duration;
    activeAudio.currentTime = newTime;
  }
}

function updateModalProgress() {
  if (activeAudio && activeAudio.duration) {
    document.getElementById('modalSeek').value = (activeAudio.currentTime / activeAudio.duration) * 100;
    document.getElementById('modalCurrentTime').innerText = formatTime(activeAudio.currentTime);
    
    // Auto sync icon if ended naturally
    if (activeAudio.ended) syncPlayPauseIcon();
  }
}

window.downloadCurrentAudio = function() {
  if (!activeType) return;
  const fileName = activeType === 'vocal' ? 'Vocals.wav' : 'Instrumental.wav';
  const audioId = activeType === 'vocal' ? 'vocalAudio' : 'instAudio';
  downloadAudio(audioId, fileName);
}

window.formatTime = function(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  return Math.floor(sec / 60) + ':' + Math.floor(sec % 60).toString().padStart(2, '0');
}

window.downloadAudio = function(id, name) {
  const url = document.getElementById(id).src;
  if (!url) return showToast('لا يوجد ملف متاح', 'error');
  
  showToast('جاري بدء التنزيل... تابع تقدم التحميل في إشعارات جوالك', 'success');
  
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

window.startProcessing = async function() {
  if (!currentFile) return showToast('اختر ملف صوتي أولاً', 'warning');
  
  const isTokenActive = localStorage.getItem('hf_token_active') !== 'false';
  const rawToken = localStorage.getItem('hf_token');
  const savedToken = (isTokenActive && rawToken) ? rawToken : null;

  if (savedToken) {
    showToast('🚀 جاري المعالجة باستخدام التوكن (السرعة القصوى)', 'success');
  } else {
    showToast('⏳ جاري المعالجة بالخطة المجانية (قد يستغرق وقتاً أطول)', 'warning');
  }

  document.getElementById('processBtn').disabled = true;
  document.getElementById('progressSection').classList.add('show');
  document.getElementById('resultsSection').classList.remove('show');
  document.getElementById('progressStatus').innerText = savedToken ? 'جاري الاتصال السريع عبر التوكن...' : 'جاري الاتصال السحابي بالخطة المجانية...';

  let p = 0;
  let simInterval = setInterval(() => {
    if (p < 30) {
      p += 1.5;
      document.getElementById('progressStatus').innerText = "جاري رفع البيانات...";
    } else if (p < 85) {
      p += 0.3;
      document.getElementById('progressStatus').innerText = "جاري العزل بالذكاء الاصطناعي...";
    }
    updateProcessing(Math.floor(p));
  }, 300);

  try {
        // الاتصال الذكي: إذا كان لديك توكن سيستخدمه، وإذا لم يكن موجوداً سيتصل مجاناً للزوار
    let spaceName = "TheStinger/UVR5_UI"; // المساحة العامة للزوار (الحصة عالـ IP)
    let clientConfig = {};

    if (savedToken) {
      spaceName = "itsalboushi/UVR5_UI"; // مساحتك الخاصة (VIP)
      clientConfig = { token: savedToken, hf_token: savedToken };
    }

    const client = await Client.connect(spaceName, clientConfig);
    
    // الحل الجذري: محرك هجين (Hybrid Engine)
    const selectedModelRadio = document.querySelector('input[name="model_choice"]:checked');
    const isKaraoke = selectedModelRadio && selectedModelRadio.id === 'model_karaoke';

    let apiEndpoint = "";
    let predictParams = {};

    if (isKaraoke) {
      // خيار 1: موسيقى وكورال (باستخدام محرك Roformer الخرافي كما في موقع MVSep)
      apiEndpoint = "/roformer_separator";
      predictParams = {
        audio: currentFile,
        model_key: "MelBand Roformer | Karaoke by Gabox", // أقوى نموذج كاريوكي حالياً
        out_format: "wav",
        segment_size: 256,
        override_seg_size: false,
        overlap: 8,
        batch_size: 1,
        norm_thresh: 0.9,
        amp_thresh: 1.0,
        single_stem: ""
      };
    } else {
      // خيار 2: موسيقى فقط (نستخدم محرك MDX23C الجبار)
      apiEndpoint = "/mdxc_separator";
      predictParams = {
        audio: currentFile,
        model: "MDX23C-8KFFT-InstVoc_HQ_2.ckpt",
        out_format: "wav",
        segment_size: 256,
        override_seg_size: false,
        overlap: 8,
        batch_size: 1,
        norm_thresh: 0.9,
        amp_thresh: 1.0,
        single_stem: ""
      };
    }

    const result = await client.predict(apiEndpoint, predictParams);

    clearInterval(simInterval);
    document.getElementById('progressStatus').innerText = 'تم العزل! جاري تحميل الصوتيات للمتصفح...';
    updateProcessing(90);

    let downloadP = 90;
    let downloadInterval = setInterval(() => {
      if (downloadP < 99) {
        downloadP += 0.5;
        updateProcessing(Math.floor(downloadP));
      }
    }, 800);

    const getUrl = (i) => {
      const baseUrl = savedToken ? "https://itsalboushi-uvr5-ui.hf.space" : "https://thestinger-uvr5-ui.hf.space";
      return typeof i === 'string' ? i : (i?.url || (i?.path ? baseUrl + "/file=" + i.path : ''));
    };
    
    // سحب الملفات الذكي
    const fetchAudio = async (url) => {
      if (!url) return '';
      try {
        let fetchOptions = {};
        if (savedToken) {
          fetchOptions = { headers: { "Authorization": `Bearer ${savedToken}` } };
        }
        const res = await fetch(url, fetchOptions);
        if (!res.ok) return ''; 
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch (e) {
        return '';
      }
    };

    // كلا المحركين (Roformer و MDX23C) يعطيان الموسيقى أولاً [0] والمطرب ثانياً [1]
    const rawInstUrl = getUrl(result.data[0]);
    const rawVocalUrl = getUrl(result.data[1]);

    const instBlob = await fetchAudio(rawInstUrl);
    const vocalBlob = await fetchAudio(rawVocalUrl);

    clearInterval(downloadInterval);

    document.getElementById('instAudio').src = instBlob;
    document.getElementById('vocalAudio').src = vocalBlob;

    // إظهار بطاقة المطرب والموسيقى دائماً لأن نماذج MDX تفصل المسارين بنجاح
    const vocalCard = document.getElementById('vocalCard');
    if (!vocalBlob) {
      vocalCard.style.display = 'none';
    } else {
      vocalCard.style.display = 'flex';
    }

    updateProcessing(100);
    document.getElementById('progressStatus').innerText = 'تمت المعالجة بنجاح!';

    // حفظ الروابط مع اسم الملف
    saveToHistory(currentFile.name, rawInstUrl, rawVocalUrl);

    setTimeout(() => {
      document.getElementById('progressSection').classList.remove('show');
      document.getElementById('resultsSection').classList.add('show');
      document.getElementById('processBtn').disabled = false;
      showToast('✨ تم الفصل بنجاح!', 'success');
    }, 1000);
  } catch (err) {
    clearInterval(simInterval);
    console.error(err);
    const msg = err.message || '';
    if (msg.toLowerCase().includes('quota')) {
      showToast('🚫 انتهت حصة الاستخدام المجاني لعنوان IP الخاص بك! افتح القفل لاستخدام التوكن.', 'error');
    } else if (msg.includes('queue')) {
      showToast('⏳ السيرفر عليه طابور انتظار ممتلئ، أعد المحاولة.', 'warning');
    } else {
      showToast('⚠️ خطأ من السيرفر: ' + (msg.substring(0, 60) || 'تأكد من التوكن أو الاتصال'), 'error');
    }
    document.getElementById('processBtn').disabled = false;
    document.getElementById('progressSection').classList.remove('show');
  }
}

function updateProcessing(percent) {
  document.getElementById('progressPercent').innerText = percent + '%';
  document.getElementById('progressFill').style.width = percent + '%';

  const steps = [{
      id: 1,
      min: 0,
      max: 25
    },
    {
      id: 2,
      min: 25,
      max: 50
    },
    {
      id: 3,
      min: 50,
      max: 75
    },
    {
      id: 4,
      min: 75,
      max: 100
    }
  ];

  steps.forEach(s => {
    const step = document.getElementById('step' + s.id);
    if (percent >= s.max) {
      step.classList.add('done');
      step.classList.remove('active');
    } else if (percent >= s.min) {
      step.classList.add('active');
      step.classList.remove('done');
    }
  });
}

window.saveToHistory = function(name, instUrl, vocalUrl) {
  let history = JSON.parse(localStorage.getItem('voiceHistory') || '[]');
  history.unshift({
    name,
    instUrl: instUrl || '',
    vocalUrl: vocalUrl || '',
    date: new Date().toLocaleString('ar-SA')
  });
  localStorage.setItem('voiceHistory', JSON.stringify(history.slice(0, 30)));
  loadHistory();
}

window.loadHistory = function() {
  const history = JSON.parse(localStorage.getItem('voiceHistory') || '[]');
  const list = document.getElementById('historyList');
  if (history.length === 0) {
    list.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 2rem;">لا توجد معالجات سابقة</p>';
    return;
  }
  
  // تحديث التنبيه ليتناسب مع الميزة الجديدة
  const warningBanner = `
    <div style="background: #e0f2fe; border-right: 4px solid #0284c7; padding: 0.8rem; margin-bottom: 1.2rem; border-radius: 8px; font-size: 0.85rem; color: #075985; display: flex; gap: 0.6rem; align-items: flex-start; line-height: 1.5;">
      <i class="fas fa-info-circle" style="margin-top: 0.2rem; font-size: 1rem;"></i>
      <span><strong>ملاحظة:</strong> يمكنك استرجاع وتشغيل المقاطع التي قمت بمعالجتها مؤخراً. الروابط تبقى فعالة لفترة مؤقتة (بضع ساعات) قبل أن يحذفها السيرفر تلقائياً.</span>
    </div>
  `;

  // إضافة أمر التشغيل (onclick) وأيقونة الـ Play
  const historyItems = history.map((h, index) => `
    <div onclick="restoreFromHistory(${index})" style="padding: 1rem; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 0.75rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: #f8fafc; transition: all 0.2s;">
      <div style="overflow: hidden;">
        <strong style="color: #334155; font-size: 0.95rem; display: block; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h.name}</strong>
        <small style="color: #94a3b8; font-weight: 600;"><i class="fas fa-calendar-alt"></i> ${h.date}</small>
      </div>
      <div style="background: #4f46e5; width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0;">
        <i class="fas fa-play" style="margin-left: 2px;"></i>
      </div>
    </div>
  `).join('');

  list.innerHTML = warningBanner + historyItems;
}

window.clearHistory = function() {
  document.getElementById('confirmModal').classList.add('open');
  history.pushState({ confirmOpen: true }, '', '#confirm');
}

window.closeConfirmModal = function() {
  if (window.location.hash === '#confirm') {
    history.back(); // هذا سيفعل حدث popstate ويقفل النافذة
  } else {
    document.getElementById('confirmModal').classList.remove('open');
  }
}

window.confirmClearHistory = function() {
  localStorage.removeItem('voiceHistory');
  loadHistory();
  showToast('تم مسح السجل بنجاح', 'success');
  closeConfirmModal();
}

window.saveSettings = async function() {
  const token = document.getElementById('hf_token_input').value.trim();
  
  if (!token) {
    localStorage.removeItem('hf_token');
    showToast('تم مسح التوكن المحفوظ لتعمل بالوضع المجاني', 'success');
    return;
  }

  if (!token.startsWith('hf_')) {
    showToast('❌ التوكن غير صالح! يجب أن يبدأ بـ hf_', 'error');
    return;
  }

  showToast('جاري التحقق من التوكن...', 'warning');
  
  try {
    const res = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (res.ok) {
      localStorage.setItem('hf_token', token);
      showToast('✅ التوكن حقيقي وشغال! تم الحفظ بنجاح', 'success');
    } else {
      showToast('❌ التوكن خاطئ أو منتهي الصلاحية!', 'error');
    }
  } catch (e) {
    showToast('⚠️ حدث خطأ أثناء الاتصال للتحقق', 'error');
  }
}

document.getElementById('hf_token_input').value = localStorage.getItem('hf_token') || '';

window.toggleTokenStatus = function() {
  const isCurrentActive = localStorage.getItem('hf_token_active') !== 'false';
  const newActiveState = !isCurrentActive;
  
  localStorage.setItem('hf_token_active', newActiveState ? 'true' : 'false');
  updateTokenLockUI(newActiveState);

  if (newActiveState) {
    showToast('🔓 تم تفعيل التوكن (السرعة القصوى)', 'success');
  } else {
    showToast('🔒 تم تجميد التوكن! ستعمل الآن بالخطة المجانية', 'warning');
  }
};

function updateTokenLockUI(isActive) {
  const btn = document.getElementById('tokenToggleBtn');
  const icon = document.getElementById('tokenLockIcon');
  const input = document.getElementById('hf_token_input');
  const statusText = document.getElementById('tokenStatusText');

  if (!btn || !icon) return;

  if (isActive) {
    icon.className = 'fas fa-lock-open';
    icon.style.color = '#10b981';
    btn.style.borderColor = '#10b981';
    btn.style.background = '#ecfdf5';
    if (input) {
      input.style.opacity = '1';
      input.style.backgroundColor = '#ffffff';
    }
    if (statusText) {
      statusText.style.color = '#10b981';
      statusText.innerHTML = '⚡ التوكن نشط (السرعة القصوى)';
    }
  } else {
    icon.className = 'fas fa-lock';
    icon.style.color = '#94a3b8';
    btn.style.borderColor = '#cbd5e1';
    btn.style.background = '#f1f5f9';
    if (input) {
      input.style.opacity = '0.6';
      input.style.backgroundColor = '#f8fafc';
    }
    if (statusText) {
      statusText.style.color = '#64748b';
      statusText.innerHTML = '🔒 التوكن مجمد مؤقتاً (يعمل بالخطة المجانية)';
    }
  }
}

updateTokenLockUI(localStorage.getItem('hf_token_active') !== 'false');

loadHistory();
showToast('👋 مرحباً بك في Voice Studio', 'success');

// دالة استرجاع الملفات من السجل
window.restoreFromHistory = async function(index) {
  const history = JSON.parse(localStorage.getItem('voiceHistory') || '[]');
  const item = history[index];
  
  if (!item || (!item.instUrl && !item.vocalUrl)) {
    showToast('⚠️ لا توجد روابط محفوظة لهذا الملف (ملف قديم تم معالجته قبل التحديث)', 'warning');
    return;
  }

  showToast('جاري استرجاع الملفات من السيرفر...', 'success');
  
  // الانتقال للاستوديو وإظهار الواجهة
  showPage('home');
  document.getElementById('fileName').innerText = item.name;
  document.getElementById('fileInfo').classList.add('show');
  
  const isTokenActive = localStorage.getItem('hf_token_active') !== 'false';
  const savedToken = (isTokenActive) ? localStorage.getItem('hf_token') : null;
  
  const fetchAudioGlobal = async (url) => {
    if (!url) return '';
    try {
      let fetchOptions = {};
      if (savedToken) fetchOptions = { headers: { "Authorization": `Bearer ${savedToken}` } };
      const res = await fetch(url, fetchOptions);
      if (!res.ok) throw new Error('Expired');
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (e) {
      return null; // الرابط منتهي الصلاحية
    }
  };

  const instBlob = await fetchAudioGlobal(item.instUrl);
  const vocalBlob = item.vocalUrl ? await fetchAudioGlobal(item.vocalUrl) : '';

  if (!instBlob) {
    showToast('❌ انتهت صلاحية هذا الرابط وتم حذفه من السيرفر، يرجى إعادة المعالجة.', 'error');
    return;
  }

  document.getElementById('instAudio').src = instBlob;
  if (vocalBlob) {
    document.getElementById('vocalAudio').src = vocalBlob;
    document.getElementById('vocalCard').style.display = 'flex';
  } else {
    document.getElementById('vocalCard').style.display = 'none';
  }
  
  currentFile = { name: item.name }; 
  document.getElementById('resultsSection').classList.add('show');
  showToast('✨ تم الاسترجاع بنجاح!', 'success');
}
