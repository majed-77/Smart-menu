"use strict";

/**
 * واجهة العميل — المصدر الأساسي عربي، والمنيو يأتي من API موحد.
 * لا توجد نسخة ثانية من بيانات المنيو داخل الواجهة، لتجنب اختلاف البيانات.
 */

/* Safari/iOS audio globals */
var speechAudioContext = window.speechAudioContext || null;
var speechSource = window.speechSource || null;
var speechUnlocked = false;

const saraTableNumber=(()=>{
  const raw=new URLSearchParams(location.search).get('table');
  return raw && /^[0-9A-Za-zأ-ي_-]{1,20}$/.test(raw.trim()) ? raw.trim() : '';
})();
function displayPrice(raw,lang){
  if(raw==='—') return lang==='ar'?'السعر غير مدرج':'—';
  const n=parseFloat(String(raw).replace(',','.'));
  if(!Number.isFinite(n)) return raw;
  return lang==='ar' ? `${n.toFixed(2)} ر.س` : `${n.toFixed(2)} SAR`;
}

let menu = [];


const TEXT={
 ar:{
  hero:'اسأل النادلة بالصوت أو الكتابة.',
  askWaiter:'🎙️ سارة',
  waiterGeneral:'سارة — النادلة',
  siteLang:'🌐 العربية',
  waiterTitle:'بأي لغة ترغب في التحدث مع النادلة؟',
  waiterSub:'اختر اللغة وسأرحب بك ثم يمكنك التحدث مباشرة.',
  close:'إغلاق', end:'إنهاء',
  placeholder:'اكتب سؤالك…',
  ready:'أنا معك، اضغط المايك وتكلم 🎤',
  recording:'أسمعك… وإذا خلصت اسكت شوي أو اضغط ⏹.',
  transcribing:'لحظة أفهم كلامك…',
  thinking:'ثواني وبرد عليك…',
  micError:'تعذر تشغيل الميكروفون.',
  permission:'على iPhone: افتح إعدادات الموقع في Safari واسمح للميكروفون، ثم أعد تحميل الصفحة.',
  hint:'المايك يشتغل تلقائيًا بعد اختيار لغة النادلة. تكلم عادي، وأثناء كلام سارة يتم تعليق المايك مؤقتًا حتى لا يقطع صوتها، وبعد ما تنتهي يرجع المايك تلقائيًا.',
  aiError:'تعذر الاتصال بالنادلة الآن.',
  apiKeyError:'مفتاح OpenAI غير موجود أو غير صحيح.',
  quotaError:'حساب OpenAI API لا يملك رصيدًا كافيًا أو تم تجاوز الحصة. أضف وسيلة دفع/رصيد في منصة OpenAI ثم جرّب مرة أخرى.',
  permissionError:'مفتاح OpenAI لا يملك صلاحية استخدام هذا الموديل.',
  serverError:'حدث خطأ في خادم الذكاء الاصطناعي. راجع Render Logs.',
  greet:(dish)=>`هلا والله 👋 معك سارة. وش حاب تعرف عن ${dish[0]}؟`
 },
 fr:{
  hero:'Menu intelligent — appelez la serveuse virtuelle et parlez-lui au micro ou par écrit.',
  askWaiter:'🎙️ Sara — la serveuse',
  waiterGeneral:'Sara — votre serveuse',
  siteLang:'🌐 Français',
  waiterTitle:'Dans quelle langue souhaitez-vous parler avec la serveuse ?',
  waiterSub:'Choisissez une langue, je vous accueillerai puis vous pourrez parler.',
  close:'Fermer', end:'Terminer',
  placeholder:'Écrivez votre question…',
  ready:'Je suis prête — appuyez sur le micro et parlez 🎤',
  recording:"Je vous écoute… appuyez sur ⏹ quand vous avez terminé.",
  transcribing:'Je comprends votre message…',
  thinking:'Un instant, je prépare ma réponse…',
  micError:"Impossible d'utiliser le microphone.",
  permission:"Sur iPhone : autorisez le microphone pour ce site dans Safari, puis rechargez la page.",
  hint:'Appuyez sur 🎤 et parlez. Après 1,5 s de silence, la question part automatiquement. ⏹ envoie immédiatement.',
  aiError:"Impossible de joindre la serveuse.",
  apiKeyError:"La clé OpenAI est absente ou invalide.",
  quotaError:"Le compte OpenAI API n'a pas de crédit suffisant ou le quota est dépassé.",
  permissionError:"La clé OpenAI n'a pas l'autorisation d'utiliser ce modèle.",
  serverError:"Erreur du serveur AI. Consultez les logs Render.",
  greet:(dish)=>`Bienvenue chez ${restaurantName('fr')}. Je suis votre serveuse virtuelle. Vous regardez ${dish[0]}. Posez-moi une question sur les ingrédients, le prix ou demandez-moi une recommandation.`
 },
 en:{
  hero:'Smart menu — call the virtual waitress and speak by microphone or text.',
  askWaiter:'🎙️ Sara — Waitress',
  waiterGeneral:'Sara — Your Waitress',
  siteLang:'🌐 English',
  waiterTitle:'Which language would you like to use with the waitress?',
  waiterSub:'Choose a language and I’ll welcome you, then you can start speaking.',
  close:'Close', end:'End',
  placeholder:'Type your question…',
  ready:'I’m ready — tap the microphone and speak 🎤',
  recording:'I’m listening… tap ⏹ when you are done.',
  transcribing:'Understanding your voice…',
  thinking:'One moment, I’m preparing your answer…',
  micError:'Unable to use the microphone.',
  permission:'On iPhone: allow microphone access for this website in Safari, then reload the page.',
  hint:'Tap 🎤 and speak. After 1.5 seconds of silence, it sends automatically. Tap ⏹ to send immediately.',
  aiError:'Unable to reach the waitress.',
  apiKeyError:'The OpenAI API key is missing or invalid.',
  quotaError:'The OpenAI API account has insufficient credit or quota.',
  permissionError:'The OpenAI key does not have permission to use this model.',
  serverError:'AI server error. Check Render logs.',
  greet:(dish)=>`Welcome to ${restaurantName('en')}. I’m your virtual waitress. You’re viewing ${dish[0]}. Ask me about ingredients, price, or let me recommend something for you.`
 }
};


const DYNAMIC_ITEM_IMAGES={};
const ITEM_IMAGES={
 "Le Matinal (1 pers)":"https://digitalmenu.tn/storage/clients/17763390988246/products/69f0b428a2deb.jpg",
 "Victorien (1 pers)":"https://digitalmenu.tn/storage/clients/17763390988246/products/69f0978cbd555.jpg",
 "Healthy (1 pers)":"https://digitalmenu.tn/storage/clients/17763390988246/products/69f0b3ff05c61.jpg",
 "CHOCO CRUNCH":"https://digitalmenu.tn/storage/clients/17763390988246/products/6a1c47eb18e21.jpg",
 "Margherita":"https://digitalmenu.tn/storage/clients/17763390988246/products/69e1ee8aaa727.jpg",
 "Burger Classique":"https://digitalmenu.tn/storage/clients/17763390988246/products/69e1f4609ee7f.jpg",
 "Salade César":"https://digitalmenu.tn/storage/clients/17763390988246/products/69e203b3e7ead.jpg",
 "Tagliatelli au Saumon":"https://digitalmenu.tn/storage/clients/17763390988246/products/69e2097cd98fb.jpg",
 "Citronnade":"https://digitalmenu.tn/storage/clients/17763390988246/products/69e17e3d2f6c5.jpg"
};
function itemImage(name){return DYNAMIC_ITEM_IMAGES[name]||ITEM_IMAGES[name]||'';}
function imageFallback(name){
 const n=(name||'').toLowerCase();
 if(/café|coffee|espresso|latte|capp/.test(n)) return '☕';
 if(/pizza/.test(n)) return '🍕';
 if(/burger/.test(n)) return '🍔';
 if(/salade/.test(n)) return '🥗';
 if(/jus|citron|orange|fraise|pomme|banane|kiwi/.test(n)) return '🥤';
 if(/dessert|pancake|crêpe|gaufre|nutella|chocolat/.test(n)) return '🍰';
 if(/pâte|spaghetti|lasagne|ravioli/.test(n)) return '🍝';
 return '🍽️';
}

let siteLanguage='ar';
let restaurantProfile={nameAr:'كافيه فيكتور هوغو',nameEn:'Café Victor Hugo',nameFr:'Café Victor Hugo',subtitleAr:'مقهى ومطعم',subtitleEn:'Café & Restaurant',subtitleFr:'Café & Restaurant',heroEyebrowAr:'منيو ذكي • سارة',heroEyebrowEn:'Smart Menu • Sara',heroEyebrowFr:'Menu intelligent • Sara',heroTitleAr:'حياكم الله',heroTitleEn:'Welcome',heroTitleFr:'Bienvenue',heroTextAr:'اطلب، احجز، أو اسأل سارة عن المنيو.',heroTextEn:'Order, reserve a table, or ask Sara about the menu.',heroTextFr:'Commandez, réservez une table ou demandez conseil à Sara.',announcementAr:'',announcementEn:'',announcementFr:'',announcementVisible:false,logoUrl:'',bannerUrl:''};
function profileText(base,lang=siteLanguage){const cap=lang==='ar'?'Ar':lang==='en'?'En':'Fr';return restaurantProfile[base+cap]||restaurantProfile[base+'Ar']||''}
function restaurantName(lang=siteLanguage){return profileText('name',lang)||'كافيه فيكتور هوغو'}
function applyRestaurantProfile(){const name=restaurantName(),sub=profileText('subtitle'),title=profileText('heroTitle'),text=profileText('heroText'),eyebrow=profileText('heroEyebrow'),ann=profileText('announcement');const n=document.querySelector('#restaurantName'),wn=document.querySelector('#welcomeRestaurantName'),s=document.querySelector('#restaurantSubtitle'),t=document.querySelector('#heroTitle'),tx=document.querySelector('#heroText'),e=document.querySelector('#heroEyebrow'),a=document.querySelector('#announcementBar'),logo=document.querySelector('#restaurantLogo'),hero=document.querySelector('#restaurantHero');if(n)n.textContent=name;if(wn)wn.textContent=name;if(s)s.textContent=sub;if(t)t.textContent=title;if(tx)tx.textContent=text;if(e)e.textContent=eyebrow;if(logo&&restaurantProfile.logoUrl)logo.src=restaurantProfile.logoUrl;if(a){a.textContent=ann;a.style.display=restaurantProfile.announcementVisible&&ann?'block':'none'}if(hero){if(restaurantProfile.bannerUrl){hero.style.backgroundImage=`url(${JSON.stringify(restaurantProfile.bannerUrl).slice(1,-1)})`;hero.classList.add('hasBanner')}else{hero.style.backgroundImage='';hero.classList.remove('hasBanner')}}document.title=name+' — المنيو';}
async function loadRestaurantProfile(){try{const r=await fetch('/api/restaurant-profile',{cache:'no-store'}),j=await r.json();if(j?.profile)restaurantProfile={...restaurantProfile,...j.profile}}catch(e){console.warn('تعذر تحميل هوية المطعم',e)}applyRestaurantProfile()}
loadRestaurantProfile();
let waiterLanguage='ar';
let saraEngine='openai';
const SARA_BRAIN_ENGINES=new Set(['hybrid3','claude','gemini','kimi','openai-deepgram']);
function isBrainSaraEngine(engine=saraEngine){return SARA_BRAIN_ENGINES.has(engine);}
function saraBrainProvider(){return saraEngine==='openai-deepgram'?'openai':saraEngine==='claude'?'claude':saraEngine==='gemini'?'gemini':saraEngine==='kimi'?'kimi':'deepseek';}
function saraBrainLabel(){return saraEngine==='openai-deepgram'?'سارة':saraEngine==='claude'?'Claude':saraEngine==='gemini'?'Gemini':saraEngine==='kimi'?'Kimi':'DeepSeek';}
let currentDish=null;
let realtimePC=null;
let realtimeDC=null;
let realtimeMicStream=null;
let realtimeRemoteAudio=null;
let realtimeConnected=false;
let realtimeStarting=false;
let realtimeAssistantBuffer='';
let realtimeAssistantSpeaking=false;
let realtimeAwaitingTranscript=false;
let realtimeMicResumeTimer=null;
let realtimeTranscriptSafetyTimer=null;
let realtimeProcessedToolCalls=new Set();
let conversationHistory=[];
let recorder=null, stream=null, chunks=[], recording=false, currentAudio=null;
let audioContext=null, analyser=null, vadFrame=null;
let altStream=null, altAnalyser=null, altAudioContext=null, altVadFrame=null, altRecorder=null, altChunks=[];
let altCapturing=false, altSpeechStartedAt=0, altSilenceAt=0, altBusy=false, altSpeaking=false, altStarted=false;
let altNoiseFloor=0.012, altNoiseReadyAt=0, altNoiseLastUpdate=0, altVoiceCandidateAt=0;
let agent2Loaded=false, agent2Element=null, agent2Conversation=null, agent2MicMuted=false, agent2LastMessages=new Set();
const ELEVEN_AGENT_ID='agent_8501m14m18cae8ysg6cghjveg0mn';
let speechStarted=false, speechStartAt=0, silenceStartAt=0;
const SILENCE_MS=1500, MIN_SPEECH_MS=300, SPEECH_THRESHOLD=0.035;

const welcomeOverlay=document.querySelector('#welcomeOverlay');
const nav=document.querySelector('#nav'), root=document.querySelector('#menu');
const modal=document.querySelector('#modal'), waiterLangStep=document.querySelector('#waiterLangStep'), chatStep=document.querySelector('#chatStep');
const title=document.querySelector('#modalDish'), orb=document.querySelector('#orb'), status=document.querySelector('#status');
const transcript=document.querySelector('#transcript'), input=document.querySelector('#askInput'), micBtn=document.querySelector('#micBtn');
const endBtn=document.querySelector('#end'), cancelWaiter=document.querySelector('#cancelWaiter'), permissionHelp=document.querySelector('#permissionHelp');
const agent2Wrap=document.querySelector('#agent2Wrap');


const EXACT_MENU_I18N = Object.create(null);
const MENU_I18N = {
  ar: { categories: Object.create(null), words: [] },
  en: { categories: Object.create(null), words: [] },
  fr: { categories: Object.create(null), words: [] }
};

function registerManagedCategories(categories = []) {
  for (const category of categories) {
    const key = String(category?.nameAr || "").trim();
    if (!key) continue;
    MENU_I18N.ar.categories[key] = key;
    MENU_I18N.en.categories[key] = String(category?.nameEn || key);
    MENU_I18N.fr.categories[key] = String(category?.nameFr || key);
  }
}

function translateMenuText(value,lang){
 const exact=EXACT_MENU_I18N[value];
 if(exact && exact[lang]) return exact[lang];
 if(lang==='fr'||!lang) return value;

 // Fallback only for future menu items that are added later.
 const pack=MENU_I18N[lang];
 if(!pack) return value;
 let out=value;
 (pack.words||[]).forEach(([a,b])=>{out=out.split(a).join(b)});
 return out;
}
function menuCategory(value,lang){
 return (MENU_I18N[lang]&&MENU_I18N[lang].categories[value])||value;
}
function refreshMenuLanguage(){
 document.querySelectorAll('#nav button').forEach((b,i)=>{
   if(menu[i]) b.textContent=menuCategory(menu[i].cat,siteLanguage);
 });

 document.querySelectorAll('#menu section').forEach((sec,i)=>{
   if(!menu[i]) return;

   const localizedCategory=menuCategory(menu[i].cat,siteLanguage);
   const h=sec.querySelector('.section-title');
   if(h){
     const titleSpan=h.querySelector('span') || h;
     titleSpan.textContent=localizedCategory;
   }

   sec.querySelectorAll('.card').forEach((card,j)=>{
     const d=menu[i].items[j];
     if(!d) return;

     const localizedName=translateMenuText(d[0],siteLanguage);
     const localizedDesc=translateMenuText(d[1],siteLanguage);

     const h3=card.querySelector('h3');
     const desc=card.querySelector('.desc');

     if(h3) h3.textContent=localizedName;
     if(desc) desc.textContent=localizedDesc;

     // Search now understands Arabic, English and French.
     card.dataset.search=(
       localizedCategory+' '+localizedName+' '+localizedDesc+' '+
       menu[i].cat+' '+d[0]+' '+d[1]
     ).toLowerCase();

     const priceEl=card.querySelector('.price');
     if(priceEl) priceEl.textContent=displayPrice(d[2],siteLanguage);

     const sig=card.querySelector('.signature');
     if(sig){
       sig.textContent=
         siteLanguage==='ar'?'⭐ صنف مميز':
         siteLanguage==='en'?'Victor Signature':
         'Signature Victor';
     }
   });
 });
}


function updateSearchPlaceholder(){
 const el=document.querySelector('#menuSearch');
 if(!el)return;
 el.placeholder=siteLanguage==='ar'?'ابحث في المنيو...':siteLanguage==='fr'?'Rechercher dans le menu...':'Search the menu...';
}
const searchInput=document.querySelector('#menuSearch');
if(searchInput){
 searchInput.addEventListener('input',()=>{
   const q=searchInput.value.trim().toLowerCase();
   let shown=0;
   document.querySelectorAll('#menu section').forEach(sec=>{
     let sectionShown=0;
     sec.querySelectorAll('.card').forEach(card=>{
       const visible=!q || card.dataset.search.includes(q);
       card.style.display=visible?'':'none';
       if(visible)sectionShown++;
     });
     sec.style.display=sectionShown?'':'none';
     shown+=sectionShown;
   });
   const empty=document.querySelector('#emptyState');
   if(empty) empty.style.display=shown?'none':'block';
 });
}

function applySiteLanguage(lang){
 siteLanguage=lang;
 document.documentElement.lang=lang; document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 applyRestaurantProfile();
 document.querySelector('#changeSiteLang').textContent=TEXT[lang].siteLang;
 document.querySelector('#waiterLangTitle').textContent=TEXT[lang].waiterTitle;
 document.querySelector('#waiterLangSubtitle').textContent=TEXT[lang].waiterSub;
 cancelWaiter.textContent=TEXT[lang].close;
 const gw=document.querySelector('#globalWaiter'); if(gw) gw.textContent=TEXT[lang].askWaiter;
 applyBookingLanguage(lang);
 refreshMenuLanguage();
 updateSearchPlaceholder();
 welcomeOverlay.classList.add('hidden');
}
document.querySelectorAll('[data-site-lang]').forEach((btn)=>{
 btn.addEventListener('click',()=>{
   const lang=btn.dataset.siteLang;
   if(!lang)return;
   applySiteLanguage(lang);
 });
});
document.querySelector('#changeSiteLang').onclick=()=>welcomeOverlay.classList.remove('hidden');
const globalWaiter=document.querySelector('#globalWaiter');
if(globalWaiter){
  globalWaiter.onclick=()=>openWaiter();
  if(saraTableNumber){
    globalWaiter.title=`طاولة ${saraTableNumber}`;
    const chip=document.createElement('div'); chip.id='tableQrBadge'; chip.textContent=`🪑 طاولة ${saraTableNumber}`;
    chip.style.cssText='position:fixed;inset-inline-end:20px;bottom:78px;z-index:24;background:#17130fee;color:#fff;border:1px solid #ffffff26;border-radius:999px;padding:8px 12px;font-weight:800;font-size:13px';
    document.body.appendChild(chip);
  }
}

function renderCustomerMenu(){
 nav.innerHTML='';
 root.innerHTML='';
 menu.forEach((s,i)=>{
  const b=document.createElement('button');
  b.textContent=menuCategory(s.cat,siteLanguage||'ar');
  b.onclick=()=>document.getElementById('s'+i).scrollIntoView({behavior:'smooth',block:'start'});
  nav.appendChild(b);

  const sec=document.createElement('section');
  sec.id='s'+i;
  sec.dataset.category=s.cat;
  sec.innerHTML=`<h2 class="section-title"><span>${menuCategory(s.cat,siteLanguage||'ar')}</span><span class="section-count">${s.items.length}</span></h2><div class="grid"></div>`;
  const grid=sec.querySelector('.grid');

  s.items.forEach(d=>{
    const c=document.createElement('article');
    c.className='card'+(d[4]?.available===false?' unavailable':'');
    const localizedName=translateMenuText(d[0],siteLanguage||'ar');
    const localizedDesc=translateMenuText(d[1],siteLanguage||'ar');
    c.dataset.search=(s.cat+' '+d[0]+' '+d[1]+' '+localizedName+' '+localizedDesc).toLowerCase();
    const img=itemImage(d[0]);
    const media=img
      ? `<img class="foodImage" loading="lazy" src="${img}" alt="${d[0]}" onerror="this.outerHTML='<div class=&quot;foodFallback&quot;>${imageFallback(d[0])}</div>'">`
      : `<div class="foodFallback">${imageFallback(d[0])}</div>`;
    c.innerHTML=`
      <div class="foodImageWrap">
        ${media}
        ${d[3]?'<span class="signature">Signature Victor</span>':''}
        ${d[4]?.available===false?`<span class="unavailableBadge">${siteLanguage==='ar'?'غير متوفر':siteLanguage==='fr'?'Indisponible':'Unavailable'}</span>`:''}
        <div class="price">${displayPrice(d[2],siteLanguage||"ar")}</div>
      </div>
      <div class="cardBody">
        <h3>${localizedName}</h3>
        <div class="desc">${localizedDesc}</div>
        ${d[4]?.calories!=null?`<div class="calories">🔥 ${Number(d[4].calories).toLocaleString(siteLanguage==='ar'?'ar-SA':'en-US')} ${siteLanguage==='ar'?'سعرة حرارية':siteLanguage==='fr'?'kcal':'kcal'}</div>`:''}
        ${Array.isArray(d[4]?.modifiers)&&d[4].modifiers.length?`<div class="modifierPreview">${d[4].modifiers.slice(0,4).map(m=>`<span class="modifierChip">${translateMenuText(m.name,siteLanguage||'ar')}${m.priceText?` +${displayPrice(m.priceText,siteLanguage||'ar')}`:''}</span>`).join('')}</div>`:''}
      </div>`;
    grid.appendChild(c);
  });
  root.appendChild(sec);
 });
 if(siteLanguage) refreshMenuLanguage();
}
function managedItemsToMenu(items, categories = []){
 registerManagedCategories(categories);
 const sections=[];
 const byCat=new Map();
 for(const item of (Array.isArray(items)?items:[])){
   const cat=String(item.category||'Autres');
   if(!byCat.has(cat)){const sec={cat,items:[]};byCat.set(cat,sec);sections.push(sec);}
   const name=String(item.nameAr||item.nameEn||item.nameFr||'صنف');
   const desc=String(item.descriptionAr||item.descriptionEn||item.descriptionFr||'');
   const price=String(item.priceText||'—');
   const meta={available:item.active!==false,calories:item.calories==null?null:Number(item.calories),modifiers:Array.isArray(item.modifiers)?item.modifiers:[],sortOrder:Number(item.sortOrder||0),categorySortOrder:Number(item.categorySortOrder||0)};
   byCat.get(cat).items.push([name,desc,price,item.signature?1:0,meta]);
   EXACT_MENU_I18N[name]={ar:String(item.nameAr||name),en:String(item.nameEn||item.nameAr||name),fr:String(item.nameFr||item.nameAr||name)};
   if(desc) EXACT_MENU_I18N[desc]={ar:String(item.descriptionAr||desc),en:String(item.descriptionEn||item.descriptionAr||desc),fr:String(item.descriptionFr||item.descriptionAr||desc)};
   if(item.imageUrl) DYNAMIC_ITEM_IMAGES[name]=String(item.imageUrl);
 }
 sections.sort((a,b)=>Number(a.items?.[0]?.[4]?.categorySortOrder||0)-Number(b.items?.[0]?.[4]?.categorySortOrder||0));
 sections.forEach(sec=>sec.items.sort((a,b)=>Number(a[4]?.sortOrder||0)-Number(b[4]?.sortOrder||0)));
 return sections.length?sections:null;
}
async function loadManagedCustomerMenu(){
 try{
   const r=await fetch('/api/menu',{cache:'no-store'});
   const j=await r.json();
   if(r.ok&&j.ok){const managed=managedItemsToMenu(j.items, j.categories);if(managed)menu=managed;}
 }catch(e){console.warn('Managed menu unavailable; using embedded menu.',e);}
 renderCustomerMenu();
}
loadManagedCustomerMenu();


function closeRealtime(){
  realtimeConnected=false;
  realtimeStarting=false;
  realtimeAssistantSpeaking=false;
  realtimeAwaitingTranscript=false;
  clearRealtimeTimers();
  try{if(realtimeDC)realtimeDC.close();}catch(e){}
  try{if(realtimePC)realtimePC.close();}catch(e){}
  if(realtimeMicStream){
    try{realtimeMicStream.getTracks().forEach(t=>t.stop());}catch(e){}
  }
  if(realtimeRemoteAudio){
    try{realtimeRemoteAudio.pause();realtimeRemoteAudio.srcObject=null;}catch(e){}
    try{realtimeRemoteAudio.remove();}catch(e){}
  }
  realtimeDC=null;
  realtimePC=null;
  realtimeMicStream=null;
  realtimeRemoteAudio=null;
  realtimeProcessedToolCalls=new Set();
  orb.classList.remove('speaking');
}

function realtimeInstructions(){
  const lang=waiterLanguage;
  const fullMenu=compactMenu();

  const languageRule=
    lang==='ar'
      ?`تكلمي بلهجة سعودية بيضاء طبيعية تميل لنجد، وبنفس اللهجة من أول المحادثة لآخرها. استخدمي كلام يومي مثل: هلا، أبشري/أبشر، وش ودك، تبي، ودك، تمام، من عيوني، خلاص. لا تغيّرين اللهجة بين الردود. تجنبي الفصحى الرسمية واللهجات المصرية والشامية والتونسية وألفاظ مثل شو، عايز، وايد، شلون، برشا.`
      :lang==='fr'
      ?`Parle uniquement en français naturel, chaleureux et conversationnel.`
      :`Speak only in natural, warm conversational English.`;

  return `اسمك سارة. أنت النادلة الصوتية العامة لمطعم ${restaurantName('ar')}.
${languageRule}
عرّفي نفسك دائمًا باسم سارة عند الترحيب الأول فقط. أنت مسؤولة عن المنيو كامل، ولست مرتبطة بصنف محدد.
افهمي كل الأصناف والأقسام والأسعار والمكونات الموجودة في بيانات المنيو أدناه.
إذا سأل العميل عن اقتراح، قارني بين الأصناف المناسبة حسب ذوقه وميزانيته وعدد الأشخاص.
إذا سأل عن سعر غير مدرج بعلامة — فقولي إن السعر غير مدرج.
لا تخترعي مكونات أو حساسية أو أسعار أو توفر غير موجود في المنيو.
${lang==='ar'?'للعميل العربي: لا تشرحي أن الأسعار محوّلة ولا تقولي عبارة «بالريال السعودي». إذا احتجتِ ذكر سعر صنف فقولي السعر طبيعي داخل الجملة، مثل: «سعره حوالي 26 ريال» أو عند تعداد الأصناف: «برغر كلاسيك، 28 ريال». لا تذكري الدينار التونسي أو DT أو TND نهائيًا. وإذا كان السعر غير مدرج فقولي فقط: السعر غير مدرج.':''}

${saraTableNumber?`طلب من داخل المطعم عبر QR:
- العميل على الطاولة رقم ${saraTableNumber} الآن.
- إذا طلب أكل أو مشروبات، لا تسألين عن الاسم أو الجوال أو التاريخ أو الوقت.
- اجمعي الأصناف والكميات وأي تعديل على كل صنف، واحفظي التعديل مع نفس الصنف في special_request مثل: برجر (بدون مايونيز).
- لخصي الطلب واسألي «أعتمد الطلب؟». بعد تأكيد واضح فقط استدعي confirm_table_order مع order_mode="table".
- إذا طلب العميل حجزًا مستقبليًا بشكل منفصل استخدمي مسار الحجز.`:`العميل داخل من رابط المنيو العادي بدون QR:
- عنده 3 خيارات مستقلة: يطلب ويأكل/يشرب داخل المطعم، أو يطلب استلام خارجي، أو يحجز طاولة فقط.
- إذا بدأ يطلب أكل أو مشروبات وما حدد الطريقة، اسأليه مرة واحدة فقط: «تبيه هنا بالمطعم ولا استلام خارجي؟».
- إذا قال هنا/بالمطعم/باكل عندكم: اجمعي الأصناف والكميات والتعديلات والاسم فقط للتعريف، ثم استدعي confirm_table_order مع order_mode="dinein" بعد التأكيد. الجوال اختياري.
- إذا قال استلام/سفري/خارجي: اجمعي الأصناف والكميات والتعديلات والاسم والجوال، ثم استدعي confirm_table_order مع order_mode="external" بعد التأكيد.
- إذا قال إنه يريد حجز طاولة فقط: استخدمي confirm_booking_order ولا تنشئين طلب أكل إلا إذا طلب طلبًا مسبقًا.
- أي إضافة أو حذف تخص صنفًا لازم تبقى داخل special_request للصنف نفسه، مثل «بدون مايونيز» أو «جبن إضافي»، ولا تحطيها كملاحظة عامة.`}

الحجز والطلب:
- تقدرين تسوين حجز طاولة مع طلب مسبق من المنيو داخل نفس المحادثة.
- إذا قال العميل إنه يبي يحجز، اجمعي: الاسم، رقم واتساب، عدد الأشخاص، التاريخ، والوقت. إذا أعطاك رقمًا محليًا ولم تعرفي الدولة، اسأليه عن الدولة قبل الحفظ. وإذا كان سعوديًا وأعطى رقمًا يبدأ بـ05 فحوّليه لصيغة +9665 بعد حذف الصفر الأول.
- رقم الجوال حساس جدًا: حافظي على ترتيب الأرقام كما قالها العميل حرفيًا ولا تبدّلين أو تعكسين أي رقم. قبل الاعتماد أعيدي الرقم مرة واحدة فقط للتأكيد. عند نطق الرقم قولي الأرقام رقمًا رقمًا وبنفس الترتيب، مثل: زائد، تسعة، ستة، ستة، خمسة... ولا تنطقيه كعدد كبير.
- عند كتابة رقم الجوال اكتبيه بصيغة دولية متصلة تبدأ بعلامة + ومن دون مسافات، مثل +9665XXXXXXXX.
- الطلب المسبق اختياري. إذا طلب أصناف، اجمعي اسم كل صنف والكمية وأي تعديل يطلبه. لا تضيفي صنفًا غير موجود في المنيو.
- إذا نقصت معلومة اسألي عنها فقط، ولا تطلبي كل المعلومات مرة وحدة إذا كان بعضها معروف.
- قبل الحفظ لازم تلخصين الحجز والطلب كاملًا بوضوح، ثم تسألين سؤال تأكيد صريح مثل: «أعتمد الحجز والطلب؟».
- ممنوع تستدعين أداة confirm_booking_order قبل ما يؤكد العميل بوضوح بكلمة مثل نعم، إيه، تمام اعتمد، أو ما يعادلها.
- مهم جدًا: إذا قاطعك العميل وأنتِ تقرئين ملخص الحجز أو الطلب وقال بوضوح «تمام اعتمدي»، «اعتمدي الحجز»، «نعم اعتمدي»، «إيه اعتمدي» أو أي تأكيد واضح مشابه، اعتبري كلامه تأكيدًا نهائيًا فورًا. لا تعيدي الملخص، ولا تكملي قراءة التفاصيل، ولا تسألي «أعتمد؟» مرة ثانية؛ استدعي confirm_booking_order مباشرة باستخدام آخر تفاصيل متفق عليها.
- إذا قاطعك العميل بتعديل بدل التأكيد، مثل تغيير الوقت أو العدد أو حذف صنف، طبقي التعديل ثم أعيدي فقط الجزء المتغير أو ملخصًا مختصرًا واسألي التأكيد مرة ثانية.
- إذا عدّل العميل أي شيء بعد الملخص، حدّثي الملخص واسألي التأكيد مرة ثانية.
- بعد نجاح الحفظ اذكري رقم الحجز باختصار، وقولي إن الحجز والطلب تم تسجيلهما. لا تدّعي أن رسالة واتساب أُرسلت الآن إلا إذا النظام أكد ذلك.

تكلمي كإنسانة حقيقية وليس كمساعد آلي.
خلي الرد غالبًا جملة أو جملتين، واسألي سؤال متابعة قصير إذا احتجت.
مهم جدًا: كمّلي كل جملة للنهاية ولا تتوقفي في منتصف الكلمة أو الجملة. لا تختصري الرد بسبب طول الصوت. أصوات الخلفية والضوضاء لا تعني أن العميل قاطعك؛ النظام سيفتح الميكروفون للعميل بعد انتهاء ردك.

بيانات المنيو كاملة:
${JSON.stringify(fullMenu)}`;
}

function setRealtimeMicEnabled(enabled){
  if(!realtimeMicStream) return;
  const track=realtimeMicStream.getAudioTracks()[0];
  if(!track) return;
  track.enabled=!!enabled;
  micBtn.textContent=enabled?'🎤':'🔇';
}

function clearRealtimeTimers(){
  if(realtimeMicResumeTimer){clearTimeout(realtimeMicResumeTimer);realtimeMicResumeTimer=null;}
  if(realtimeTranscriptSafetyTimer){clearTimeout(realtimeTranscriptSafetyTimer);realtimeTranscriptSafetyTimer=null;}
}

function resumeRealtimeMicAfter(ms=1200){
  if(realtimeMicResumeTimer) clearTimeout(realtimeMicResumeTimer);
  realtimeMicResumeTimer=setTimeout(()=>{
    realtimeAssistantSpeaking=false;
    realtimeAwaitingTranscript=false;
    setRealtimeMicEnabled(true);
    status.textContent=TEXT[waiterLanguage].ready;
  },ms);
}

function createRealtimeResponse(){
  if(!realtimeDC || realtimeDC.readyState!=='open') return;
  realtimeAssistantSpeaking=true;
  setRealtimeMicEnabled(false);
  realtimeDC.send(JSON.stringify({type:'response.create'}));
}

function normalizeMenuLookupText(v){
  return String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
function resolveSaraOrderItem(requestedName){
  const q=normalizeMenuLookupText(requestedName);
  if(!q) return null;
  const candidates=[];
  menu.forEach(section=>section.items.forEach(d=>{
    const names=[d[0],translateMenuText(d[0],waiterLanguage),translateMenuText(d[0],'ar'),translateMenuText(d[0],'en')];
    const keys=names.map(normalizeMenuLookupText);
    let score=0;
    if(keys.includes(q)) score=100;
    else{
      keys.forEach(k=>{
        if(!k)return;
        if(k.includes(q)||q.includes(k)) score=Math.max(score,80-Math.abs(k.length-q.length));
        const qt=new Set(q.split(' ')), kt=new Set(k.split(' '));
        const overlap=[...qt].filter(x=>kt.has(x)).length;
        if(overlap) score=Math.max(score,overlap*12);
      });
    }
    if(score>0)candidates.push({score,d});
  }));
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length || candidates[0].score<18) return null;
  const d=candidates[0].d;
  const raw=String(d[2]||'');
  const tnd=parseFloat(raw.replace(',','.'));
  const unitPriceSar=Number.isFinite(tnd)?Math.round(tnd*100)/100:null;
  return {name:translateMenuText(d[0],waiterLanguage),canonicalName:d[0],unitPriceSar,available:d[4]?.available!==false,modifiers:Array.isArray(d[4]?.modifiers)?d[4].modifiers:[]};
}
function saraModifierExtraSar(found,specialRequest=''){
  const req=normalizeMenuLookupText(specialRequest); if(!req||!Array.isArray(found?.modifiers))return 0;
  let extra=0; const seen=new Set();
  for(const m of found.modifiers){
    const key=normalizeMenuLookupText(m?.name||''); if(!key||seen.has(key)||!req.includes(key))continue;
    seen.add(key); const raw=String(m?.priceText||'').replace(',','.'); const n=parseFloat(raw);
    if(Number.isFinite(n)&&n>0) extra+=n;
  }
  return Math.round(extra*100)/100;
}
function normalizeSaraPhone(value){
  let s=String(value||'')
    .replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .trim()
    .replace(/[\s().-]/g,'')
    .replace(/[^+\d]/g,'');
  if(s.startsWith('00')) s='+'+s.slice(2);
  if(/^05\d{8}$/.test(s)) s='+966'+s.slice(1);
  if(/^9665\d{8}$/.test(s)) s='+'+s;
  if(/^\d{8}$/.test(s)) s='+216'+s;
  if(/^216\d{8}$/.test(s)) s='+'+s;
  return s;
}

function isExplicitBookingConfirmation(text){
  const t=String(text||'')
    .replace(/[ًٌٍَُِّْـ]/g,'')
    .replace(/[إأآ]/g,'ا')
    .replace(/ى/g,'ي')
    .toLowerCase()
    .trim();
  if(!t) return false;
  const hasApprove=/(اعتمد|اعتمدي|اكدي|اكد|ثبت|ثبتي|نفذ|نفذي|سجل|سجلي)/.test(t);
  const hasYes=/(^|\s)(نعم|ايه|اي|تمام|اوكي|موافق|خلاص|صح)(\s|$)/.test(t);
  const bookingWord=/(الحجز|الطلب)/.test(t);
  return hasApprove || (hasYes && (bookingWord || altAwaitingBookingApproval()));
}
function cancelRealtimeAssistantForBargeIn(){
  if(!realtimeDC || realtimeDC.readyState!=='open') return;
  try{realtimeDC.send(JSON.stringify({type:'response.cancel'}));}catch(e){}
  // Ask the server to drop any queued audio if supported. Older clients may
  // ignore this event, so response.cancel remains the primary mechanism.
  try{realtimeDC.send(JSON.stringify({type:'output_audio_buffer.clear'}));}catch(e){}
  realtimeAssistantSpeaking=false;
  orb.classList.remove('speaking');
}

function saraToolMessage(kind,data={}){
  const lang=waiterLanguage||'ar';
  if(kind==='saving') return lang==='ar'?'لحظة، أعتمد الحجز والطلب…':lang==='fr'?'Un instant, je confirme votre réservation…':'One moment, I’m confirming your booking…';
  if(kind==='notFound') return lang==='ar'?`ما قدرت أربط الصنف «${data.name||''}» بالمنيو. اسألي العميل يحدد الصنف مرة ثانية.`:lang==='fr'?`Je n’ai pas pu retrouver « ${data.name||''} » dans le menu. Demande au client de préciser.`:`I couldn't match “${data.name||''}” to the menu. Ask the guest to clarify the item.`;
  if(kind==='success') return lang==='ar'?`تم حفظ الحجز والطلب بنجاح. رقم الحجز ${data.code}.`:lang==='fr'?`Réservation et commande enregistrées. Numéro ${data.code}.`:`Booking and order saved successfully. Confirmation code ${data.code}.`;
  return lang==='ar'?'تعذر حفظ الحجز الآن. اعتذري للعميل واطلبي منه المحاولة مرة ثانية.':lang==='fr'?`Impossible d’enregistrer la réservation maintenant. Présente tes excuses et propose de réessayer.`:`The booking could not be saved right now. Apologize and ask the guest to try again.`;
}

async function saveSaraTableOrder(args={}){
  const resolved=[];
  for(const item of (Array.isArray(args.order_items)?args.order_items:[])){
    const found=resolveSaraOrderItem(item?.item_name);
    if(!found) throw Object.assign(new Error(`ما لقيت الصنف «${item?.item_name||''}» بالمنيو بشكل واضح.`),{code:'MENU_ITEM_NOT_FOUND'});
    if(found.available===false) throw Object.assign(new Error(`الصنف «${found.name}» غير متوفر حاليًا.`),{code:'MENU_ITEM_UNAVAILABLE'});
    const specialRequest=String(item?.special_request||'').trim(); const extra=saraModifierExtraSar(found,specialRequest);
    resolved.push({name:found.canonicalName,quantity:Math.max(1,Math.min(20,Number(item?.quantity)||1)),specialRequest,unitPriceSar:found.unitPriceSar==null?null:Math.round((found.unitPriceSar+extra)*100)/100});
  }
  const customerName=String(args.customer_name||args.name||'').trim();
  const customerPhone=normalizeSaraPhone(args.phone||'');
  const requestedMode=String(args.order_mode||'').toLowerCase();
  const orderMode=saraTableNumber?'table':(requestedMode==='dinein'?'dinein':'external');
  if(orderMode!=='table' && !customerName) throw new Error(orderMode==='dinein'?'احتاج اسمك عشان أرسل طلب الأكل داخل المطعم.':'احتاج اسمك عشان أرسل طلب الاستلام الخارجي.');
  if(orderMode==='external' && !customerPhone) throw new Error('احتاج رقم جوالك عشان أرسل طلب الاستلام الخارجي.');
  const r=await fetch('/api/table-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tableNumber:saraTableNumber,orderMode,customerName,phone:customerPhone,notes:String(args.notes||'').trim(),language:waiterLanguage,orderItems:resolved})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.order) throw new Error(data.message||'تعذر حفظ طلب الطاولة');
  return data.order;
}
async function handleSaraTableOrderTool(callId,argsText){
  if(!callId || realtimeProcessedToolCalls.has(callId)) return;
  realtimeProcessedToolCalls.add(callId);
  realtimeAssistantSpeaking=true; setRealtimeMicEnabled(false);
  status.textContent=waiterLanguage==='ar'?`لحظة، أرسل طلب طاولة ${saraTableNumber}…`:'Sending your table order…';
  let args={}; try{args=JSON.parse(argsText||'{}')}catch(e){}
  try{
    const order=await saveSaraTableOrder(args);
    const modeLabel=order.orderMode==='dinein'?'للأكل داخل المطعم':order.orderMode==='external'?'للاستلام الخارجي':`لطاولة ${order.tableNumber}`;
    const output={ok:true,message:`تم إرسال الطلب ${modeLabel}. رقم الطلب ${order.code}.`,order};
    realtimeDC.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(output)}}));
    realtimeDC.send(JSON.stringify({type:'response.create',response:{instructions:waiterLanguage==='ar'?`قولي باختصار: تم إرسال طلبك ${modeLabel}، ورقم الطلب ${order.code}.`:`Briefly confirm the order was sent. Order number ${order.code}.`}}));
  }catch(err){
    const output={ok:false,message:String(err.message||'تعذر إرسال الطلب')};
    try{realtimeDC.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(output)}}));realtimeDC.send(JSON.stringify({type:'response.create',response:{instructions:`اعتذري باختصار: ${output.message}`}}));}catch(e){}
  }
}
async function handleSaraBookingTool(callId,argsText){
  if(!callId || realtimeProcessedToolCalls.has(callId)) return;
  realtimeProcessedToolCalls.add(callId);
  realtimeAssistantSpeaking=true;
  setRealtimeMicEnabled(false);
  status.textContent=saraToolMessage('saving');
  let args={};
  try{args=JSON.parse(argsText||'{}');}catch(e){}
  try{
    const resolved=[];
    for(const item of (Array.isArray(args.order_items)?args.order_items:[])){
      const found=resolveSaraOrderItem(item?.item_name);
      if(!found){
        const output={ok:false,code:'MENU_ITEM_NOT_FOUND',message:saraToolMessage('notFound',{name:item?.item_name})};
        realtimeDC.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(output)}}));
        realtimeDC.send(JSON.stringify({type:'response.create'}));
        return;
      }
      if(found.available===false){
        const output={ok:false,code:'MENU_ITEM_UNAVAILABLE',message:`الصنف «${found.name}» غير متوفر حاليًا.`};
        realtimeDC.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(output)}}));realtimeDC.send(JSON.stringify({type:'response.create'}));return;
      }
      const specialRequest=String(item?.special_request||'').trim(); const extra=saraModifierExtraSar(found,specialRequest);
      resolved.push({name:found.canonicalName,displayName:found.name,quantity:Math.max(1,Math.min(20,Number(item?.quantity)||1)),specialRequest,unitPriceSar:found.unitPriceSar==null?null:Math.round((found.unitPriceSar+extra)*100)/100});
    }
    const payload={
      name:String(args.name||'').trim(),phone:normalizeSaraPhone(args.phone),partySize:Number(args.party_size),date:String(args.date||''),time:String(args.time||''),notes:String(args.notes||'').trim(),language:waiterLanguage,source:'sara_voice',
      orderItems:resolved.map(x=>({name:x.canonicalName,quantity:x.quantity,specialRequest:x.specialRequest,unitPriceSar:x.unitPriceSar}))
    };
    const r=await fetch('/api/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.reservation){
      const err=new Error(data.message||'Booking save failed');
      err.bookingCode=data.code||'BOOKING_SAVE_ERROR';
      err.httpStatus=r.status;
      throw err;
    }
    const output={ok:true,message:saraToolMessage('success',{code:data.reservation.code}),reservation:data.reservation};
    realtimeDC.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(output)}}));
    realtimeDC.send(JSON.stringify({type:'response.create',response:{instructions:waiterLanguage==='ar'?`قولي للعميل باختصار إن الحجز${resolved.length?' والطلب':''} تم تسجيله بنجاح، واذكري رقم الحجز ${data.reservation.code}. لا تعيدي كل التفاصيل إلا إذا طلب.`:waiterLanguage==='fr'?`Confirme brièvement que la réservation${resolved.length?' et la commande':''} est enregistrée et donne le numéro ${data.reservation.code}.`:`Briefly confirm the booking${resolved.length?' and order':''} was saved and give confirmation code ${data.reservation.code}.`}}));
  }catch(err){
    console.error('Sara booking tool failed',err);
    const reason=String(err.message||saraToolMessage('error'));
    const code=String(err.bookingCode||'BOOKING_SAVE_ERROR');
    const output={ok:false,code,message:reason};
    showDiagnostic(`الحجز لم يُحفظ: ${reason} [${code}]`,false);
    try{
      realtimeDC.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(output)}}));
      realtimeDC.send(JSON.stringify({
        type:'response.create',
        response:{instructions:waiterLanguage==='ar'
          ?`الحجز لم يُحفظ. السبب: ${reason}. اشرحي السبب للعميل بشكل بسيط ومباشر واطلبي فقط المعلومة التي تحتاج تصحيحها. إذا كان السبب عطل قاعدة بيانات، اعتذري واطلبي إعادة المحاولة. لا تقولي فقط مشكلة تقنية إذا كان السبب واضحًا.`
          :waiterLanguage==='fr'
          ?`La réservation n'a pas été enregistrée. Raison : ${reason}. Explique brièvement la raison et demande uniquement l'information à corriger.`
          :`The booking was not saved. Reason: ${reason}. Briefly explain the reason and ask only for the information that needs correction.`}
      }));
    }catch(e){}
  }
}

function handleRealtimeEvent(event){
  let e;
  try{e=JSON.parse(event.data);}catch(err){return;}

  if(e.type==='response.function_call_arguments.done' && e.name==='confirm_table_order'){
    handleSaraTableOrderTool(e.call_id,e.arguments);
    return;
  }
  if(e.type==='response.function_call_arguments.done' && e.name==='confirm_booking_order'){
    handleSaraBookingTool(e.call_id,e.arguments);
    return;
  }
  if(e.type==='response.output_item.done' && e.item?.type==='function_call' && e.item?.name==='confirm_table_order'){
    handleSaraTableOrderTool(e.item.call_id,e.item.arguments);
    return;
  }
  if(e.type==='response.output_item.done' && e.item?.type==='function_call' && e.item?.name==='confirm_booking_order'){
    handleSaraBookingTool(e.item.call_id,e.item.arguments);
    return;
  }

  if(e.type==='input_audio_buffer.speech_started'){
    // Keep listening while Sara is talking so the guest can naturally barge in.
    // We do NOT cancel on VAD alone; cancellation waits for a real transcript,
    // which avoids café noise cutting Sara off.
    status.textContent=
      waiterLanguage==='ar'?(realtimeAssistantSpeaking?'سمعتك، لحظة…':'أسمعك…'):
      waiterLanguage==='fr'?(realtimeAssistantSpeaking?'Je vous ai entendu…':"Je vous écoute…"):
      (realtimeAssistantSpeaking?'I heard you…':"I'm listening…");
  }

  if(e.type==='input_audio_buffer.speech_stopped'){
    // Freeze the mic while the server finishes transcription. This prevents
    // café noise from opening a second turn before we know what was said.
    realtimeAwaitingTranscript=true;
    setRealtimeMicEnabled(false);
    status.textContent=
      waiterLanguage==='ar'?'لحظة أفهم كلامك…':
      waiterLanguage==='fr'?'Je comprends votre message…':
      'Understanding your voice…';

    if(realtimeTranscriptSafetyTimer) clearTimeout(realtimeTranscriptSafetyTimer);
    realtimeTranscriptSafetyTimer=setTimeout(()=>{
      if(realtimeAwaitingTranscript && !realtimeAssistantSpeaking){
        realtimeAwaitingTranscript=false;
        setRealtimeMicEnabled(true);
        status.textContent=TEXT[waiterLanguage].ready;
      }
    },3000);
  }

  if(e.type==='response.audio.delta' || e.type==='response.output_audio.delta'){
    realtimeAssistantSpeaking=true;
    // Allow true user speech to be transcribed while Sara is talking. Server VAD
    // stays conservative, and we only cancel after a meaningful transcript.
    setRealtimeMicEnabled(true);
    orb.classList.add('speaking');
  }

  if(e.type==='response.audio.done' || e.type==='response.output_audio.done'){
    orb.classList.remove('speaking');
    // Do not reopen the microphone immediately. The phone speaker can still
    // be playing the tail of the buffered audio for a short moment.
    resumeRealtimeMicAfter(1400);
  }

  if(e.type==='response.done'){
    orb.classList.remove('speaking');
    // Fallback for clients that do not emit a separate audio.done event.
    if(!realtimeMicResumeTimer) resumeRealtimeMicAfter(1600);
  }

  if(e.type==='response.audio_transcript.delta' || e.type==='response.output_audio_transcript.delta'){
    realtimeAssistantBuffer += e.delta || '';
  }

  if(e.type==='response.audio_transcript.done' || e.type==='response.output_audio_transcript.done'){
    const text=(e.transcript || realtimeAssistantBuffer || '').trim();
    if(text){
      addBubble('assistant',text);
      conversationHistory.push({role:'assistant',content:text});
    }
    realtimeAssistantBuffer='';
  }

  if(e.type==='conversation.item.input_audio_transcription.completed'){
    if(realtimeTranscriptSafetyTimer){clearTimeout(realtimeTranscriptSafetyTimer);realtimeTranscriptSafetyTimer=null;}
    const text=(e.transcript||'').trim();
    realtimeAwaitingTranscript=false;

    // Ignore tiny/empty background-noise transcriptions instead of creating
    // an AI turn from them.
    const meaningful = text.replace(/[\s\p{P}\p{S}]/gu,'').length >= 2;
    if(text && meaningful){
      const interruptedSara=realtimeAssistantSpeaking;
      const explicitBookingConfirm=isExplicitBookingConfirmation(text);
      addBubble('user',text);
      conversationHistory.push({role:'user',content:text});

      if(interruptedSara){
        // Only now, after actual words were transcribed, stop Sara. This gives
        // natural barge-in without letting background noise truncate responses.
        cancelRealtimeAssistantForBargeIn();
      }

      status.textContent=explicitBookingConfirm && waiterLanguage==='ar'
        ?'تمام، أعتمد الحجز…'
        :TEXT[waiterLanguage].thinking;
      createRealtimeResponse();
    }else if(!realtimeAssistantSpeaking){
      setRealtimeMicEnabled(true);
      status.textContent=TEXT[waiterLanguage].ready;
    }
  }

  if(e.type==='error'){
    console.error('Realtime error',e);
    const msg=e.error?.message || 'Realtime voice error';
    showDiagnostic(msg,false);
    status.textContent=msg;
    realtimeAssistantSpeaking=false;
    realtimeAwaitingTranscript=false;
    setRealtimeMicEnabled(true);
  }
}

function closeAltSara(){
  altStarted=false; altBusy=false; altSpeaking=false; altCapturing=false; altBookingState={name:'',phone:'',partySize:null,date:'',time:'',notes:'',orderItems:[]}; altBookingActive=false; altLastConfirmedBooking={signature:'',code:'',at:0}; altBookingSaveInFlight=false; altBargeCandidateAt=0; altCaptureStartedDuringSara=false; altLastSpokenText=''; altSpeechStoppedAt=0;
  if(altVadFrame){cancelAnimationFrame(altVadFrame);altVadFrame=null;}
  try{if(altRecorder && altRecorder.state!=="inactive")altRecorder.stop();}catch(e){}
  altRecorder=null; altChunks=[];
  if(altStream){try{altStream.getTracks().forEach(t=>t.stop());}catch(e){} altStream=null;}
  if(altAudioContext){try{altAudioContext.close();}catch(e){} altAudioContext=null;}
  altAnalyser=null;
  stopAISpeech();
}

async function altFetchJSON(url, options, timeout=45000){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(url,{...options,signal:controller.signal});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.message||data.error||`HTTP ${r.status}`);
    return data;
  }finally{clearTimeout(timer)}
}


let altBookingState={name:'',phone:'',partySize:null,date:'',time:'',notes:'',orderItems:[]};
let altBookingActive=false;
let altLastConfirmedBooking={signature:'',code:'',at:0};
let altBookingSaveInFlight=false;
let altBargeCandidateAt=0;
let altTtsStartedAt=0;
let altTtsEndedAt=0;
let altLastSpokenText='';
let altCaptureStartedDuringSara=false;
let altSpeechStoppedAt=0;
function normalizeArabicDigitsExp3(v){return String(v||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));}
function exp3TodayISO(){try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>parts.find(p=>p.type===t)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`;}catch(e){return new Date(Date.now()+3*3600000).toISOString().slice(0,10)}}
function exp3PhoneDigitsFromSpeech(raw){
  raw=normalizeArabicDigitsExp3(String(raw||'')).replace(/[،,.;:!?؟]/g,' ').replace(/\s+/g,' ').trim();
  // Preserve the exact phone digits the guest said. Do not force a Saudi/Tunisian
  // length here: some restaurant records intentionally use non-standard lengths.
  // We only require 8-15 digits so times/dates cannot be mistaken for a phone.
  const candidates=raw.match(/\+?[0-9](?:[0-9\s().-]*[0-9])?/g)||[];
  for(const candidate of candidates){
    const digits=candidate.replace(/\D/g,'');
    if(digits.length>=8 && digits.length<=15){
      return (candidate.trim().startsWith('+')?'+':'')+digits;
    }
  }
  const map={صفر:'0',زيرو:'0',واحد:'1',وحده:'1',واحدة:'1',اثنين:'2',إثنين:'2',اثنان:'2',ثنين:'2',ثنتين:'2',ثلاثة:'3',ثلاثه:'3',اربعة:'4',أربعة:'4',اربعه:'4',خمسة:'5',خمسه:'5',ستة:'6',سته:'6',سبعة:'7',سبعه:'7',ثمانية:'8',ثمانيه:'8',تسعة:'9',تسعه:'9'};
  const toks=raw.split(/\s+/); let best='',cur='';
  for(const tok0 of toks){
    const tok=tok0.replace(/^و(?=[ء-ي])/,'');
    if(/^\d$/.test(tok))cur+=tok;
    else if(map[tok]!=null)cur+=map[tok];
    else {if(cur.length>best.length)best=cur;cur='';}
  }
  if(cur.length>best.length)best=cur;
  return best.length>=8&&best.length<=15?best:'';
}
function exp3UpdateBookingState(text,role='user'){
  let raw=normalizeArabicDigitsExp3(String(text||'')).replace(/\s+/g,' ').trim(); if(!raw)return;
  if(role==='user' && /(?:احجز|أحجز|حجز|الحجز|حجزت|حجزي|طاولة)/.test(raw)) altBookingActive=true;
  const phone=exp3PhoneDigitsFromSpeech(raw);
  if(phone)altBookingState.phone=phone;
  const rawForNames=raw.replace(/[،,.!?؟]+$/g,'').trim();
  let m=rawForNames.match(/(?:اسم(?:\s+الحجز)?|اسمي|باسم)\s+([\u0600-\u06FF]{2,})(?=\s+(?:رقم|والرقم|واتساب|رقم الواتساب|لـ|لشخص|اليوم|بكره|غدا|غدًا|الساعة)|$)/i);
  if(m)altBookingState.name=m[1];
  // Sara's booking summary is also authoritative context. Keep the same booking state
  // instead of making the guest repeat their name at final confirmation.
  if(role==='assistant'&&!altBookingState.name){
    m=raw.match(/(?:^|[،,.]\s*)تمام\s+([\u0600-\u06FF]{2,})(?=[،,.\s])/);
    if(m&&!/(حجز|الحجز|تمام|اكيد|أكيد)/.test(m[1]))altBookingState.name=m[1];
  }
  if(role==='user'&&!altBookingState.name){
    m=rawForNames.match(/^([\u0600-\u06FF]{2,})$/); if(m&&!/(اعتمد|تمام|نعم|ايه|حجز|واتساب)/.test(m[1]))altBookingState.name=m[1];
  }
  m=raw.match(/(?:ل|لـ)?(\d{1,2})\s*(?:اشخاص|أشخاص|شخص)/); if(m)altBookingState.partySize=Math.max(1,Math.min(30,Number(m[1])));
  if(/(?:ل|لـ)?شخصين/.test(raw)) altBookingState.partySize=2;
  const partyWords={'واحد':1,'واحدة':1,'اثنين':2,'إثنين':2,'ثنين':2,'ثنتين':2,'ثلاثة':3,'ثلاثه':3,'اربعة':4,'أربعة':4,'اربعه':4,'خمسة':5,'خمسه':5,'ستة':6,'سته':6,'سبعة':7,'سبعه':7,'ثمانية':8,'ثمانيه':8,'تسعة':9,'تسعه':9,'عشرة':10,'عشره':10};
  for(const [w,n] of Object.entries(partyWords)){
    if(new RegExp(`(?:ل|لـ)?${w}\\s+(?:اشخاص|أشخاص|اشخاصًا|أشخاصًا)`).test(raw)){altBookingState.partySize=n;break;}
  }
  if(/(?:^|\s|[،,.!?؟])اليوم(?=$|\s|[،,.!?؟])/.test(raw))altBookingState.date=exp3TodayISO();
  const iso=(raw.match(/\b20\d{2}-\d{2}-\d{2}\b/)||[])[0]; if(iso)altBookingState.date=iso;
  m=raw.match(/الساعة\s*(\d{1,2})(?::(\d{2}))?\s*(?:و?نص(?:ف)?|و?نصف)?\s*(صباح(?:ا|ًا)?|مساء(?:ً|ا|ًا)?|ظهر(?:ا|ًا)?|بالليل|ليل(?:ا|ًا)?|المغرب)?/);
  if(m){
    let h=Number(m[1]),min=Number(m[2]||0),ap=m[3]||'';
    if(!m[2]&&/(?:و?نص(?:ف)?|و?نصف)/.test(m[0]))min=30;
    const isPm=/(?:مساء|بالليل|ليل|المغرب)/.test(ap)||/(?:مساء|بالليل|ليل|المغرب)/.test(raw);
    const isAm=/صباح/.test(ap)||/صباح/.test(raw);
    if(isPm&&h<12)h+=12;
    if(isAm&&h===12)h=0;
    altBookingState.time=String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');
  }
  const hourWords={'واحدة':1,'وحدة':1,'اثنتين':2,'ثنتين':2,'ثلاثة':3,'ثلاثه':3,'أربعة':4,'اربعة':4,'خمسة':5,'خمسه':5,'ستة':6,'سته':6,'سبعة':7,'سبعه':7,'ثمانية':8,'ثمانيه':8,'تسعة':9,'تسعه':9,'عشرة':10,'عشره':10,'احدعش':11,'إحدى عشرة':11};
  for(const [w,h0] of Object.entries(hourWords)){
    const hm=raw.match(new RegExp(`الساعة\\s+${w}(?:\\s+(?:و?نص(?:ف)?|و?نصف))?`));
    if(hm){
      let h=h0,min=/(?:و?نص(?:ف)?|و?نصف)/.test(hm[0])?30:0;
      if(/(?:مساء|بالليل|ليل|المغرب)/.test(raw)&&h<12)h+=12;
      if(/صباح/.test(raw)&&h===12)h=0;
      altBookingState.time=String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');
    }
  }
}
function exp3BookingArgsFromState(){return {name:altBookingState.name||'',phone:altBookingState.phone||'',party_size:Number(altBookingState.partySize)||0,date:altBookingState.date||'',time:altBookingState.time||'',notes:altBookingState.notes||'',order_items:Array.isArray(altBookingState.orderItems)?altBookingState.orderItems:[]};}
function exp3MergeToolArgs(args){
  const st=exp3BookingArgsFromState();
  // Booking state is authoritative for date/time because it was extracted from the
  // guest's actual Arabic phrasing (e.g. "عشرة ونص بالليل" => 22:30).
  // This prevents an LLM tool call from downgrading it back to ambiguous 10:30.
  return {...args,name:String(st.name||args.name||'').trim(),phone:String(st.phone||args.phone||'').trim(),party_size:Number(st.party_size||args.party_size||0),date:String(st.date||args.date||''),time:String(st.time||args.time||''),notes:String(args.notes||st.notes||''),order_items:Array.isArray(args.order_items)&&args.order_items.length?args.order_items:st.order_items};
}

async function askAltSara(question,{greeting=false}={}){
  return altFetchJSON('/api/sara-alt-chat',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({question,menu:compactMenu(),history:conversationHistory.slice(isBrainSaraEngine()?-4:-10),language:waiterLanguage,greeting,tableNumber:saraTableNumber,bookingState:isBrainSaraEngine()&&!saraTableNumber?altBookingState:null,provider:isBrainSaraEngine()?saraBrainProvider():'deepseek'})
  },60000);
}


async function handleAltTableOrderTool(toolCall){
  let args={}; try{args=JSON.parse(toolCall?.arguments||'{}')}catch(e){}
  status.textContent=waiterLanguage==='ar'?(saraTableNumber?`لحظة، أرسل طلب طاولة ${saraTableNumber}…`:'لحظة، أرسل طلبك للمطعم…'):'Sending your order…';
  const order=await saveSaraTableOrder(args);
  if(order.orderMode==='dinein') return waiterLanguage==='ar'?`تم، أرسلت طلبك للأكل داخل المطعم. رقم طلبك ${order.code}.`:waiterLanguage==='fr'?`C'est envoyé pour consommation sur place. Numéro ${order.code}.`:`Done. Your dine-in order was sent. Order number ${order.code}.`;
  if(order.orderMode==='external'||!saraTableNumber) return waiterLanguage==='ar'?`تم، أرسلت طلب الاستلام الخارجي للمطعم. رقم طلبك ${order.code}.`:waiterLanguage==='fr'?`C'est envoyé pour emporter. Numéro ${order.code}.`:`Done. Your pickup order was sent. Order number ${order.code}.`;
  return waiterLanguage==='ar'?`تم، أرسلت طلبك للمطعم لطاولة ${order.tableNumber}. رقم طلبك ${order.code}.`:waiterLanguage==='fr'?`C'est envoyé à la table ${order.tableNumber}. Numéro de commande ${order.code}.`:`Done. Your order was sent for table ${order.tableNumber}. Order number ${order.code}.`;
}
function altBookingSignature(args){
  const items=Array.isArray(args?.order_items)?args.order_items:[];
  const normalizedItems=items.map(x=>({
    item_name:String(x?.item_name||'').trim().toLowerCase(),
    quantity:Number(x?.quantity)||1,
    special_request:String(x?.special_request||'').trim().toLowerCase()
  })).sort((a,b)=>a.item_name.localeCompare(b.item_name)||a.quantity-b.quantity||a.special_request.localeCompare(b.special_request));
  return JSON.stringify({
    name:String(args?.name||'').trim().toLowerCase(),
    phone:normalizeSaraPhone(args?.phone),
    party_size:Number(args?.party_size)||0,
    date:String(args?.date||''),
    time:String(args?.time||''),
    notes:String(args?.notes||'').trim().toLowerCase(),
    order_items:normalizedItems
  });
}
async function handleAltBookingTool(toolCall){
  let args={}; try{args=JSON.parse(toolCall?.arguments||'{}');}catch(e){}
  if(isBrainSaraEngine()) args=exp3MergeToolArgs(args);
  const signature=altBookingSignature(args);
  if(altBookingSaveInFlight){
    return waiterLanguage==='ar'?'لحظة، الحجز قاعد ينحفظ الآن.':waiterLanguage==='fr'?`Un instant, la réservation est en cours d’enregistrement.`:`One moment, the booking is being saved.`;
  }
  if(altLastConfirmedBooking.signature===signature && altLastConfirmedBooking.code && (Date.now()-altLastConfirmedBooking.at)<30*60*1000){
    return waiterLanguage==='ar'?`حجزك معتمد مسبقًا. رقم حجزك ${altLastConfirmedBooking.code}.`:waiterLanguage==='fr'?`Votre réservation est déjà confirmée sous le numéro ${altLastConfirmedBooking.code}.`:`Your booking is already confirmed. Your booking number is ${altLastConfirmedBooking.code}.`;
  }
  altBookingSaveInFlight=true;
  status.textContent=saraToolMessage('saving');
  const resolved=[];
  for(const item of (Array.isArray(args.order_items)?args.order_items:[])){
    const found=resolveSaraOrderItem(item?.item_name);
    if(!found){
      return waiterLanguage==='ar'?`ما لقيت الصنف «${item?.item_name||''}» بالمنيو بشكل واضح. وش الصنف اللي تقصده؟`:waiterLanguage==='fr'?`Je ne retrouve pas clairement « ${item?.item_name||''} » dans le menu. Quel article voulez-vous ?`:`I couldn't clearly match “${item?.item_name||''}” to the menu. Which item do you mean?`;
    }
    if(found.available===false) throw new Error(`الصنف «${found.name}» غير متوفر حاليًا.`);
    const specialRequest=String(item?.special_request||'').trim(); const extra=saraModifierExtraSar(found,specialRequest);
    resolved.push({name:found.canonicalName,quantity:Math.max(1,Math.min(20,Number(item?.quantity)||1)),specialRequest,unitPriceSar:found.unitPriceSar==null?null:Math.round((found.unitPriceSar+extra)*100)/100});
  }
  const payload={
    name:String(args.name||'').trim(),phone:normalizeSaraPhone(args.phone),partySize:Number(args.party_size),date:String(args.date||''),time:String(args.time||''),notes:String(args.notes||'').trim(),language:waiterLanguage,source:'sara_voice',orderItems:resolved
  };
  try{
    const r=await fetch('/api/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.reservation) throw new Error(data.message||'Booking save failed');
    const code=data.reservation.code;
    altLastConfirmedBooking={signature,code:String(code),at:Date.now()};
    return waiterLanguage==='ar'?`تم، اعتمدت الحجز${resolved.length?' والطلب':''} بنجاح. رقم حجزك ${code}.`:waiterLanguage==='fr'?`C'est confirmé. La réservation${resolved.length?' et la commande':''} est enregistrée sous le numéro ${code}.`:`Done. Your booking${resolved.length?' and order':''} is confirmed. Your booking number is ${code}.`;
  } finally {
    altBookingSaveInFlight=false;
  }
}

function stopAltSpeechForBargeIn(){
  if(!altSpeaking)return;
  stopAISpeech();
  altSpeaking=false;
  altSpeechStoppedAt=performance.now();
  status.textContent=waiterLanguage==='ar'?'سمعتك، كمّل…':waiterLanguage==='fr'?'Je vous écoute…':'I’m listening…';
}

async function speakAltSara(text,{waitForEnd=false}={}){
  const clean=String(text||'').trim(); if(!clean)return;
  altLastSpokenText=clean;
  stopAISpeech();
  const r=await fetch('/api/sara-alt-tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:clean,language:waiterLanguage})});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.message||`TTS HTTP ${r.status}`);}
  const blob=await r.blob();
  const AC=window.AudioContext||window.webkitAudioContext;
  if(AC){
    if(!speechAudioContext)speechAudioContext=new AC();
    if(speechAudioContext.state==='suspended')await speechAudioContext.resume();
    const bytes=await blob.arrayBuffer();
    const decoded=await speechAudioContext.decodeAudioData(bytes.slice(0));
    await new Promise((resolve,reject)=>{
      try{
        speechSource=speechAudioContext.createBufferSource(); speechSource.buffer=decoded; speechSource.connect(speechAudioContext.destination);
        altSpeaking=true; altTtsStartedAt=performance.now(); altBargeCandidateAt=0; orb.classList.add('speaking');
        speechSource.onended=()=>{orb.classList.remove('speaking');speechSource=null;altSpeaking=false;altTtsEndedAt=performance.now();altBargeCandidateAt=0;resolve();};
        speechSource.start(0);
        if(!waitForEnd) resolve();
      }catch(e){reject(e)}
    });
    return;
  }
  const url=URL.createObjectURL(blob); const audio=new Audio(url); currentAudio=audio; audio.playsInline=true;
  altSpeaking=true; altTtsStartedAt=performance.now(); altBargeCandidateAt=0; orb.classList.add('speaking');
  const ended=new Promise((resolve,reject)=>{audio.onended=()=>{altSpeaking=false;altTtsEndedAt=performance.now();altBargeCandidateAt=0;orb.classList.remove('speaking');URL.revokeObjectURL(url);if(currentAudio===audio)currentAudio=null;resolve();};audio.onerror=reject;});
  await audio.play(); if(waitForEnd)await ended;
}

function startAltCapture({duringSara=false}={}){
  if(!altStream || altCapturing || (altBusy && !(isBrainSaraEngine() && (altSpeaking||duringSara))))return;
  altCaptureStartedDuringSara=Boolean(duringSara);
  const mime=bestMime(); altChunks=[];
  try{altRecorder=new MediaRecorder(altStream,mime?{mimeType:mime}:undefined);}catch(e){return;}
  altRecorder.ondataavailable=e=>{if(e.data?.size)altChunks.push(e.data)};
  altRecorder.onstop=async()=>{
    const rec=altRecorder; altRecorder=null; altCapturing=false;
    const type=rec?.mimeType||mime||'audio/webm'; const blob=new Blob(altChunks,{type}); altChunks=[];
    if(blob.size<700){altBusy=false;return;}
    await processAltVoice(blob,type);
  };
  altRecorder.start(100); altCapturing=true; altSpeechStartedAt=performance.now(); altSilenceAt=0;
  micBtn.classList.add('recording'); micBtn.textContent='⏹';
}

function stopAltCapture(){
  if(!altCapturing)return;
  micBtn.classList.remove('recording'); micBtn.textContent='🎤';
  try{if(altRecorder&&altRecorder.state!=='inactive')altRecorder.stop();}catch(e){altCapturing=false;}
}

function runAltVAD(){
  if(!altAnalyser)return;
  const data=new Uint8Array(altAnalyser.fftSize);
  const tick=()=>{
    if(!altStarted||!altAnalyser)return;
    altAnalyser.getByteTimeDomainData(data); let sum=0;
    for(let i=0;i<data.length;i++){const x=(data[i]-128)/128;sum+=x*x;}
    const rms=Math.sqrt(sum/data.length), now=performance.now();
    const isHybrid3=isBrainSaraEngine();
    const isDeepgramEngine=saraEngine==='openai-deepgram';

    // Deepgram Saudi STT needs a little more microphone sensitivity than the
    // other hybrid engines. Lower thresholds reduce missed first/quiet words,
    // while the longer end-silence window avoids cutting the guest mid-sentence.
    const startThreshold=isDeepgramEngine?0.016:(isHybrid3?0.024:0.055);
    const keepThreshold=isDeepgramEngine?0.011:(isHybrid3?0.018:0.040);
    const minSpeechMs=isDeepgramEngine?180:(isHybrid3?280:220);
    const endSilenceMs=isDeepgramEngine?1250:(isHybrid3?1100:600);
    const canStart=!altBusy || (isHybrid3 && altSpeaking);

    if(canStart && !altCapturing){
      if(isHybrid3 && altSpeaking){
        // Separate barge-in detection from end-of-turn detection. A nearby voice
        // can stop Sara, while a short plate/music spike should not.
        const bargeThreshold=0.050, bargeHoldMs=95, ttsGraceMs=180;
        if(now-altTtsStartedAt>ttsGraceMs && rms>bargeThreshold){
          if(!altBargeCandidateAt)altBargeCandidateAt=now;
          if(now-altBargeCandidateAt>=bargeHoldMs){
            stopAltSpeechForBargeIn();
            startAltCapture({duringSara:true});
            altBargeCandidateAt=0;
          }
        }else altBargeCandidateAt=0;
      }else if(rms>startThreshold){
        // Start immediately so the first syllable is not clipped. The minimum
        // speech duration + STT language lock reject tiny noise bursts later.
        startAltCapture();
        altVoiceCandidateAt=0;
      }
    }

    if(altCapturing){
      if(rms>keepThreshold){altSilenceAt=0;}
      else if(now-altSpeechStartedAt>minSpeechMs){
        if(!altSilenceAt)altSilenceAt=now;
        if(now-altSilenceAt>endSilenceMs)stopAltCapture();
      }
    }
    altVadFrame=requestAnimationFrame(tick);
  };
  altVadFrame=requestAnimationFrame(tick);
}
function altAwaitingBookingApproval(){
  const last=[...conversationHistory].reverse().find(m=>m?.role==='assistant');
  const t=String(last?.content||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(اعتمد الحجز|اعتمد\?|اثبت الحجز|اكد الحجز|أعتمد الحجز|أعتمد\؟)/.test(String(last?.content||'')) ||
         (/(حجز|الحجز)/.test(t) && /(اعتمد|اكد|ثبت)/.test(t));
}
function altAwaitingOrderApproval(){
  const last=[...conversationHistory].reverse().find(m=>m?.role==='assistant');
  const t=String(last?.content||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(اعتمد الطلب|اعتمد\?|ارسل الطلب|أعتمد الطلب|أعتمد\؟)/.test(String(last?.content||'')) ||
         (/(طلب|الطلب)/.test(t) && /(اعتمد|اكد|ثبت|ارسل)/.test(t));
}
function normalizeAltBookingApprovalTranscript(text){
  const raw=String(text||'').trim();
  if(!(altAwaitingBookingApproval()||altAwaitingOrderApproval())) return raw;
  const t=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[.!؟?،,;:]/g,'').replace(/\s+/g,' ').trim();

  // Respect clear rejections first. This prevents a short foreign STT guess
  // such as "no" from ever being treated as approval.
  if(/^(لا|مو|كلا|no|nope|nah|non)$/.test(t)) return raw;

  // Known short approval variants / common STT guesses.
  if(/^(evet|temet|chatgpt|yes|yeah|yep|yup|ok|okay|si|eh|nem|nem termeszet|oui|ta|da|ja|sim|mhm|uh huh|تمام|نعم|ايه|إيه|اي|اعتمد|اعتمدي)$/.test(t)) return 'اعتمد';

  const approvalHits=(t.match(/اعتمد(?:ي)?|اثبت|أثبت|اكد|أكد|نعم|ايه|إيه|تمام|موافق|evet|yes|si|oui|ta|da|ja|sim/g)||[]).length;
  if(approvalHits>=2 && t.length<140) return 'اعتمد';

  // Experimental 3 Arabic mode: one-word confirmations such as "إيه" are
  // occasionally returned by STT as a tiny phrase in an unrelated language
  // (for example "Hey, Temet." or even another script). While Sara is
  // explicitly waiting for booking approval, never show that gibberish to the
  // guest. A very short non-Arabic result is treated as the intended approval.
  // Longer utterances still pass through so corrections remain possible.
  if(waiterLanguage==='ar'){
    const hasArabic=/[\u0600-\u06FF]/.test(raw);
    const compact=raw.replace(/[\s.!؟?،,;:]+/g,'');
    const words=raw.trim().split(/\s+/).filter(Boolean).length;
    if(!hasArabic && compact.length>0 && compact.length<=28 && words<=4) return 'اعتمد';
  }

  return raw;
}
function exp3CanConfirmBookingNow(){
  const a=exp3BookingArgsFromState();
  return Boolean(a.name && a.phone && Number(a.party_size)>0 && a.date && a.time);
}
async function exp3ConfirmBookingDirectly(){
  const args=exp3BookingArgsFromState();
  return handleAltBookingTool({name:'confirm_booking_order',arguments:JSON.stringify(args)});
}

function exp3IsRepeatPhoneRequest(text){
  const t=String(text||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(اعد|اعيد|عيد|كرر|قولي|قول).*?(رقم|واتساب)|(?:رقم|واتساب).*?(مره ثانيه|مرة ثانية|من جديد|اعد|اعيد|كرر)/.test(t);
}
function exp3IsPhoneCorrection(text){
  const t=String(text||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(الرقم|واتساب).*(غلط|خطا|مو صح|غير صحيح|الصحيح|عدل|صحح|غير)|(?:غلط|خطا).*(الرقم|واتساب)/.test(t);
}
function exp3PhoneDisplay(phone){return String(phone||'').replace(/\s+/g,'');}
function exp3PhoneWords(phone){
  const m={'0':'صفر','1':'واحد','2':'اثنين','3':'ثلاثة','4':'أربعة','5':'خمسة','6':'ستة','7':'سبعة','8':'ثمانية','9':'تسعة','+':'زائد'};
  return String(phone||'').split('').filter(ch=>m[ch]).map(ch=>m[ch]).join('، ');
}
function exp3BookingMissingFields(){
  const a=exp3BookingArgsFromState(), miss=[];
  if(!a.name)miss.push('الاسم'); if(!a.phone)miss.push('رقم الواتساب'); if(!a.party_size)miss.push('عدد الأشخاص'); if(!a.date)miss.push('التاريخ'); if(!a.time)miss.push('الوقت');
  return miss;
}
function exp3BookingMissingReply(){
  if(!altBookingActive || saraTableNumber)return '';
  const miss=exp3BookingMissingFields();
  if(!miss.length)return '';
  const field=miss[0];
  if(waiterLanguage==='ar'){
    if(field==='الاسم')return 'تمام، وش الاسم اللي أسجل عليه الحجز؟';
    if(field==='رقم الواتساب')return 'تمام، عطيني رقم الجوال أو الواتساب عشان أكمل الحجز.';
    if(field==='عدد الأشخاص')return 'تمام، الحجز لكم شخص؟';
    if(field==='التاريخ')return 'تمام، أي يوم تبي الحجز؟';
    if(field==='الوقت')return 'تمام، الساعة كم تبي الحجز؟';
  }
  if(waiterLanguage==='fr')return field==='رقم الواتساب'?'Quel est votre numéro WhatsApp pour terminer la réservation ?':`Il me manque encore : ${field}.`;
  return field==='رقم الواتساب'?'What WhatsApp/mobile number should I use to complete the booking?':`I still need: ${field}.`;
}
function exp3PhoneReplyAfterCorrection(){
  const p=exp3PhoneDisplay(altBookingState.phone); if(!p)return '';
  const miss=exp3BookingMissingFields();
  if(!miss.length)return `تمام، عدلت رقم الواتساب إلى ${p}. باقي بيانات حجزك محفوظة. أعتمد الحجز؟`;
  return `تمام، عدلت رقم الواتساب إلى ${p}. باقي بياناتك محفوظة، وباقي عندي ${miss[0]} فقط.`;
}
function exp3NormalizeForEcho(text){
  return String(text||'').toLowerCase().replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').replace(/[^\u0600-\u06FF0-9a-z ]/gi,' ').replace(/\s+/g,' ').trim();
}
function exp3LooksLikeSaraEcho(transcript){
  if(!isBrainSaraEngine() || !altCaptureStartedDuringSara || !altLastSpokenText)return false;
  const q=exp3NormalizeForEcho(transcript), a=exp3NormalizeForEcho(altLastSpokenText);
  // Never suppress short real barge-ins such as "لا", "إيه", "اعتمد".
  if(q.length<12 || q.split(' ').length<3)return false;
  if(a.includes(q) && q.length>=16)return true;
  const qs=new Set(q.split(' ').filter(w=>w.length>1));
  const as=new Set(a.split(' ').filter(w=>w.length>1));
  if(!qs.size||!as.size)return false;
  let common=0; for(const w of qs)if(as.has(w))common++;
  const coverage=common/qs.size;
  return coverage>=0.72 && common>=3;
}
async function processAltVoice(blob,mime){
  altBusy=true;
  try{
    status.textContent=TEXT[waiterLanguage].transcribing;
    const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';
    const form=new FormData(); form.append('audio',blob,'voice.'+ext); form.append('language',waiterLanguage); if(saraEngine==='openai-deepgram')form.append('mode','deepgram-stt'); else if(isBrainSaraEngine())form.append('mode','hybrid3');
    const sttUrl=isBrainSaraEngine()?'/api/transcribe':'/api/sara-alt-transcribe';
    const r=await fetch(sttUrl,{method:'POST',body:form}); const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.text)throw new Error(d.message||'Transcription failed');
    let q=String(d.text).trim(); if(!q)return;
    q=normalizeAltBookingApprovalTranscript(q);
    if(exp3LooksLikeSaraEcho(q)){
      console.info('Experimental 3: ignored probable Sara echo',q);
      altCaptureStartedDuringSara=false;
      altBusy=false; status.textContent=TEXT[waiterLanguage].ready;
      return;
    }
    altCaptureStartedDuringSara=false;
    const wasPhoneCorrection=isBrainSaraEngine() && !saraTableNumber && exp3IsPhoneCorrection(q);
    if(isBrainSaraEngine()&&!saraTableNumber)exp3UpdateBookingState(q,'user');
    addBubble('user',q); conversationHistory.push({role:'user',content:q});
    status.textContent=isExplicitBookingConfirmation(q)&&waiterLanguage==='ar'?'تمام، أعتمد الحجز…':TEXT[waiterLanguage].thinking;
    let answer='';
    if(isBrainSaraEngine() && !saraTableNumber && exp3IsRepeatPhoneRequest(q) && altBookingState.phone){
      answer=`رقم الواتساب المسجل عندي ${exp3PhoneDisplay(altBookingState.phone)}.`;
    }else if(isBrainSaraEngine() && wasPhoneCorrection && altBookingState.phone){
      answer=exp3PhoneReplyAfterCorrection();
    }else if(isBrainSaraEngine() && !saraTableNumber && altAwaitingBookingApproval() && isExplicitBookingConfirmation(q) && exp3CanConfirmBookingNow()){
      answer=await exp3ConfirmBookingDirectly();
    }else if(isBrainSaraEngine() && !saraTableNumber && exp3BookingMissingReply()){
      answer=exp3BookingMissingReply();
    }else{
      const data=await askAltSara(q);
      if(data.toolCall?.name==='confirm_table_order') answer=await handleAltTableOrderTool(data.toolCall); else if(data.toolCall?.name==='confirm_booking_order') answer=await handleAltBookingTool(data.toolCall); else answer=String(data.answer||'').trim();
    }
    if(!answer)throw new Error('No answer');
    if(isBrainSaraEngine()&&!saraTableNumber)exp3UpdateBookingState(answer,'assistant');
    addBubble('assistant',answer); conversationHistory.push({role:'assistant',content:answer}); status.textContent=TEXT[waiterLanguage].ready;
    if(isBrainSaraEngine()) await speakAI(answer); else await speakAltSara(answer,{waitForEnd:false});
    altBusy=false;
  }catch(e){
    console.error('Alt Sara voice error',e); altBusy=false; status.textContent=e.message||TEXT[waiterLanguage].serverError; showDiagnostic(status.textContent,false);
  }
}

async function submitAltQuestion(q){
  q=String(q||'').trim();if(!q)return;
  q=normalizeAltBookingApprovalTranscript(q);
  const wasPhoneCorrection=isBrainSaraEngine() && !saraTableNumber && exp3IsPhoneCorrection(q);
  if(isBrainSaraEngine()&&!saraTableNumber)exp3UpdateBookingState(q,'user');
  stopAltSpeechForBargeIn(); addBubble('user',q);conversationHistory.push({role:'user',content:q});input.value='';altBusy=true;status.textContent=TEXT[waiterLanguage].thinking;
  try{
    let answer='';
    if(isBrainSaraEngine() && !saraTableNumber && exp3IsRepeatPhoneRequest(q) && altBookingState.phone){
      answer=`رقم الواتساب المسجل عندي ${exp3PhoneDisplay(altBookingState.phone)}.`;
    }else if(isBrainSaraEngine() && wasPhoneCorrection && altBookingState.phone){
      answer=exp3PhoneReplyAfterCorrection();
    }else if(isBrainSaraEngine() && !saraTableNumber && altAwaitingBookingApproval() && isExplicitBookingConfirmation(q) && exp3CanConfirmBookingNow()){
      answer=await exp3ConfirmBookingDirectly();
    }else if(isBrainSaraEngine() && !saraTableNumber && exp3BookingMissingReply()){
      answer=exp3BookingMissingReply();
    }else{
      const data=await askAltSara(q);
      if(data.toolCall?.name==='confirm_table_order')answer=await handleAltTableOrderTool(data.toolCall);else if(data.toolCall?.name==='confirm_booking_order')answer=await handleAltBookingTool(data.toolCall);else answer=String(data.answer||'').trim();
    }
    if(!answer)throw new Error('No answer'); if(isBrainSaraEngine()&&!saraTableNumber)exp3UpdateBookingState(answer,'assistant'); addBubble('assistant',answer);conversationHistory.push({role:'assistant',content:answer});status.textContent=TEXT[waiterLanguage].ready;if(isBrainSaraEngine())await speakAI(answer);else await speakAltSara(answer,{waitForEnd:false});altBusy=false;
  }catch(e){altBusy=false;status.textContent=e.message||TEXT[waiterLanguage].serverError;showDiagnostic(status.textContent,false);}
}

async function startAltSara(){
  if(altStarted)return;
  try{
    const cfg=await altFetchJSON('/api/sara-alt-status',{cache:'no-store'});
    if(!cfg.configured)throw new Error(waiterLanguage==='ar'?'المحرك التجريبي يحتاج مفاتيح ElevenLabs وDeepSeek وFish Audio في Render.':'Experimental engine keys are not configured.');
    const supported=navigator.mediaDevices.getSupportedConstraints?.()||{};
    const constraints={echoCancellation:true,noiseSuppression:true,autoGainControl:false,channelCount:1};if(supported.voiceIsolation)constraints.voiceIsolation=true;
    altStream=await navigator.mediaDevices.getUserMedia({audio:constraints});
    const AC=window.AudioContext||window.webkitAudioContext; altAudioContext=new AC(); const src=altAudioContext.createMediaStreamSource(altStream); altAnalyser=altAudioContext.createAnalyser();altAnalyser.fftSize=1024;altAnalyser.smoothingTimeConstant=.2;src.connect(altAnalyser);
    altStarted=true; altBusy=true;
    showDiagnostic(waiterLanguage==='ar'?'✅ تجريبي 1 جاهز':waiterLanguage==='fr'?'✅ Expérimental 1 prêt':'✅ Experimental 1 ready',true);
    const data=await askAltSara('',{greeting:true}); const answer=String(data.answer||'').trim();
    if(answer){addBubble('assistant',answer);conversationHistory.push({role:'assistant',content:answer});status.textContent=TEXT[waiterLanguage].ready;await speakAltSara(answer,{waitForEnd:true});}
    altBusy=false; runAltVAD(); status.textContent=TEXT[waiterLanguage].ready;
  }catch(e){console.error('Alt Sara start failed',e);closeAltSara();status.textContent=e.message;showDiagnostic(e.message,false);}
}


function setStandardChatVisible(visible){
  const ids=['orb','status','transcript'];
  ids.forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=visible?'':'none';});
  const ask=document.querySelector('.askRow'); if(ask) ask.style.display=visible?'flex':'none';
  const hint=document.getElementById('recordHint'); if(hint) hint.style.display=visible?'':'none';
  const test=document.getElementById('testAudioBtn'); if(test) test.style.display=visible?'':'none';
  const diag=document.getElementById('diagBox'); if(diag && !visible) diag.style.display='none';
  if(agent2Wrap) agent2Wrap.style.display=visible?'none':'block';
}

async function loadAgent2SDK(){
  if(window.__ELEVENLABS_CONVERSATION__) return window.__ELEVENLABS_CONVERSATION__;
  const mod=await import('https://cdn.jsdelivr.net/npm/@elevenlabs/client/+esm');
  if(!mod?.Conversation) throw new Error('تعذر تحميل نظام المحادثة.');
  window.__ELEVENLABS_CONVERSATION__=mod.Conversation;
  return mod.Conversation;
}

function agent2EventText(event){
  if(!event) return '';
  if(typeof event==='string') return event.trim();
  return String(event.message||event.text||event.transcript||event.content||event?.data?.message||event?.data?.text||'').trim();
}
function agent2EventRole(event){
  const source=String(event?.source||event?.role||event?.type||event?.data?.source||event?.data?.role||'').toLowerCase();
  if(source.includes('user')) return 'user';
  if(source.includes('ai')||source.includes('agent')||source.includes('assistant')) return 'assistant';
  return '';
}
function addAgent2Message(event){
  const text=agent2EventText(event), role=agent2EventRole(event);
  if(!text||!role) return;
  const key=role+'|'+text;
  if(agent2LastMessages.has(key)) return;
  agent2LastMessages.add(key);
  if(agent2LastMessages.size>50){const first=agent2LastMessages.values().next().value;agent2LastMessages.delete(first);}
  addBubble(role,text);
  conversationHistory.push({role,content:text});
}
function setAgent2Mode(modeLike){
  const mode=String(modeLike?.mode||modeLike||'').toLowerCase();
  const speaking=mode.includes('speaking');
  orb.classList.toggle('speaking',speaking);
  status.textContent=speaking
    ?(waiterLanguage==='ar'?'سارة تتكلم…':waiterLanguage==='fr'?'Sara parle…':'Sara is speaking…')
    :(waiterLanguage==='ar'?'أنا معك، تكلم على طول 🎤':waiterLanguage==='fr'?'Je vous écoute 🎤':'I’m listening 🎤');
}

async function startAgent2(){
  if(agent2Conversation) return;
  try{
    if(agent2Wrap) agent2Wrap.style.display='none';
    status.textContent=waiterLanguage==='ar'?'جاري تشغيل سارة…':waiterLanguage==='fr'?'Connexion à Sara…':'Starting Sara…';
    permissionHelp.classList.remove('show');

    // Request microphone permission from our own UI, then let the SDK create
    // its WebRTC session. The provider's default widget is not rendered.
    const testStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false}});
    testStream.getTracks().forEach(t=>t.stop());

    const Conversation=await loadAgent2SDK();
    agent2LastMessages=new Set();
    agent2MicMuted=false;
    agent2Conversation=await Conversation.startSession({
      agentId:ELEVEN_AGENT_ID,
      onConnect:()=>{
        agent2Loaded=true;
        micBtn.textContent='🎤';
        status.textContent=waiterLanguage==='ar'?'أنا معك، تكلم على طول 🎤':waiterLanguage==='fr'?'Je vous écoute 🎤':'I’m listening 🎤';
        showDiagnostic(waiterLanguage==='ar'?'✅ سارة جاهزة':waiterLanguage==='fr'?'✅ Sara est prête':'✅ Sara is ready',true);
      },
      onDisconnect:()=>{
        orb.classList.remove('speaking');
        if(modal.classList.contains('show')) status.textContent=waiterLanguage==='ar'?'انتهت المحادثة.':waiterLanguage==='fr'?'Conversation terminée.':'Conversation ended.';
      },
      onMessage:(event)=>addAgent2Message(event),
      onModeChange:(mode)=>setAgent2Mode(mode),
      onStatusChange:(state)=>{
        const st=String(state?.status||state||'').toLowerCase();
        if(st.includes('connecting')) status.textContent=waiterLanguage==='ar'?'جاري الاتصال بسارة…':waiterLanguage==='fr'?'Connexion à Sara…':'Connecting to Sara…';
      },
      onError:(error)=>{
        console.error('Experimental 2 error',error);
        const msg=String(error?.message||error||'تعذر تشغيل المحادثة.');
        status.textContent=msg; showDiagnostic(msg,false);
      }
    });
  }catch(e){
    console.error('Experimental 2 start failed',e);
    agent2Conversation=null;
    const msg=waiterLanguage==='ar'?`تعذر تشغيل سارة: ${e.message||e}`:waiterLanguage==='fr'?`Impossible de démarrer Sara : ${e.message||e}`:`Could not start Sara: ${e.message||e}`;
    status.textContent=msg; showDiagnostic(msg,false);
    permissionHelp.textContent=TEXT[waiterLanguage].permission; permissionHelp.classList.add('show');
  }
}

async function closeAgent2(){
  const c=agent2Conversation;
  agent2Conversation=null; agent2Loaded=false; agent2MicMuted=false; agent2LastMessages=new Set();
  try{if(c)await c.endSession();}catch(e){}
  orb.classList.remove('speaking');
  micBtn.textContent='🎤';
  if(agent2Wrap){agent2Wrap.innerHTML='';agent2Wrap.style.display='none';}
}

async function startHybrid3(){
  if(altStarted)return;
  try{
    const supported=navigator.mediaDevices.getSupportedConstraints?.()||{};
    const constraints={echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1};
    if(supported.voiceIsolation)constraints.voiceIsolation=true;
    altStream=await navigator.mediaDevices.getUserMedia({audio:constraints});
    const AC=window.AudioContext||window.webkitAudioContext;
    altAudioContext=new AC();
    const src=altAudioContext.createMediaStreamSource(altStream);
    altAnalyser=altAudioContext.createAnalyser();
    altAnalyser.fftSize=2048;
    // Faster envelope response for Deepgram so quiet/short Saudi utterances
    // trigger recording earlier instead of being swallowed by smoothing.
    altAnalyser.smoothingTimeConstant=saraEngine==='openai-deepgram'?.18:.35;
    src.connect(altAnalyser);
    // Fixed VAD: no restaurant-noise calibration; native phone processing handles noise.
    altNoiseFloor=0.012; altNoiseLastUpdate=0; altVoiceCandidateAt=0; altBargeCandidateAt=0;
    altNoiseReadyAt=0;
    altStarted=true; altBusy=true;
    const engineReadyNote=saraEngine==='openai-deepgram'
      ? (waiterLanguage==='ar'?'🟢 سارة جاهزة':waiterLanguage==='fr'?'🟢 Sara prête':'🟢 Sara ready')
      : (waiterLanguage==='ar'?'🧠 ':'🧠 ')+saraBrainLabel()+(waiterLanguage==='ar'?' جاهز':waiterLanguage==='fr'?' prêt':' ready');
    showDiagnostic(engineReadyNote,true);
    // Fast greeting: this sentence is fixed, so do not wait for the brain API.
    // Show it immediately and start TTS while the rest of the voice session finishes.
    const answer=waiterLanguage==='ar'
      ? `هلا والله، حياك في ${restaurantName('ar')}، معك سارة، كيف أقدر أخدمك؟`
      : waiterLanguage==='fr'
      ? `Bienvenue chez ${restaurantName('fr')}, je suis Sara. Comment puis-je vous aider ?`
      : `Welcome to ${restaurantName('en')}, I’m Sara. How can I help you?`;
    addBubble('assistant',answer); conversationHistory.push({role:'assistant',content:answer});
    status.textContent=TEXT[waiterLanguage].ready;
    await speakAI(answer);
    altBusy=false; runAltVAD(); status.textContent=TEXT[waiterLanguage].ready;
  }catch(e){
    console.error('Hybrid 3 start failed',e); closeAltSara(); status.textContent=e.message; showDiagnostic(e.message,false);
  }
}

async function startRealtime(){
  if(realtimeConnected || realtimeStarting) return;
  realtimeStarting=true;

  try{
    const pc=new RTCPeerConnection();
    realtimePC=pc;

    const audio=document.createElement('audio');
    audio.autoplay=true;
    audio.playsInline=true;
    audio.volume=1.0;
    audio.style.display='none';
    document.body.appendChild(audio);
    realtimeRemoteAudio=audio;

    pc.ontrack=(ev)=>{
      audio.srcObject=ev.streams[0];
      audio.play().catch(err=>console.warn('Remote audio play',err));
    };

    const supported=navigator.mediaDevices.getSupportedConstraints?.()||{};
    const audioConstraints={
      echoCancellation:true,
      noiseSuppression:true,
      autoGainControl:false,
      channelCount:1
    };
    if(supported.voiceIsolation) audioConstraints.voiceIsolation=true;

    const stream=await navigator.mediaDevices.getUserMedia({audio:audioConstraints});

    realtimeMicStream=stream;
    stream.getTracks().forEach(track=>pc.addTrack(track,stream));

    const dc=pc.createDataChannel('oai-events');
    realtimeDC=dc;
    dc.addEventListener('message',handleRealtimeEvent);

    dc.addEventListener('open',()=>{
      realtimeConnected=true;
      realtimeStarting=false;
      status.textContent=TEXT[waiterLanguage].ready;

      showDiagnostic(
        waiterLanguage==='ar'
          ?'✅ المايك جاهز — تكلم على طول'
          :waiterLanguage==='fr'
          ?'✅ Micro prêt — parlez directement'
          :'✅ Microphone ready — just start speaking',
        true
      );

      realtimeAssistantSpeaking=true;
      setRealtimeMicEnabled(false);
      dc.send(JSON.stringify({
        type:'response.create',
        response:{
          instructions:
            waiterLanguage==='ar'
              ?`ابدئي بترحيب قصير وطبيعي باللهجة السعودية، واذكري اسم المطعم واسمك بوضوح. قولي: هلا والله، حياك في ${restaurantName('ar')}، معك سارة، كيف أقدر أخدمك؟ لا تقولي كلمة نادلتك في الترحيب، ولا تذكري أي تفاصيل تقنية. إذا كان مناسبًا، تقدرين تساعدين في المنيو أو الحجز والطلب.`
              :waiterLanguage==='fr'
              ?`Accueille brièvement le client, mentionne clairement le restaurant ${restaurantName('fr')} et présente-toi comme Sara, sa serveuse. Puis demande comment tu peux l'aider avec le menu.`
              :`Give a very brief welcome, clearly mention ${restaurantName('en')}, introduce yourself as Sara, the guest's waitress, then ask how you can help with the menu.`
        }
      }));
    });

    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);

    const r=await fetch('/api/realtime-call',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        sdp:offer.sdp,
        language:waiterLanguage,
        instructions:realtimeInstructions()
      })
    });

    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.message||data.error||`HTTP ${r.status}`);
    if(!data.sdp) throw new Error('Realtime SDP answer missing');

    await pc.setRemoteDescription({type:'answer',sdp:data.sdp});
  }catch(e){
    console.error('Realtime start failed',e);
    realtimeStarting=false;
    closeRealtime();

    const msg=
      waiterLanguage==='ar'
        ?`تعذر تشغيل المحادثة الصوتية: ${e.message}`
        :waiterLanguage==='fr'
        ?`Impossible de démarrer la voix : ${e.message}`
        :`Could not start live voice: ${e.message}`;

    status.textContent=msg;
    showDiagnostic(msg,false);
  }
}

function openWaiter(){
 closeAgent2();
 currentDish=null; conversationHistory=[]; realtimeProcessedToolCalls=new Set();
 waiterLanguage=siteLanguage||'ar'; permissionHelp.classList.remove('show');
 waiterLangStep.classList.remove('hidden'); chatStep.classList.add('hidden'); modal.classList.add('show');
}
cancelWaiter.onclick=closeWaiter;
document.querySelectorAll('[data-sara-engine]').forEach(b=>b.onclick=()=>{
 saraEngine=b.dataset.saraEngine||'openai';
 setStandardChatVisible(true);
 document.querySelectorAll('[data-sara-engine]').forEach(x=>x.classList.toggle('active',x===b));
});
document.querySelectorAll('[data-waiter-lang]').forEach(b=>b.onclick=async()=>{
 waiterLanguage=b.dataset.waiterLang;
 waiterLangStep.classList.add('hidden');
 chatStep.classList.remove('hidden');

 title.textContent=TEXT[waiterLanguage].waiterGeneral;

 const t=TEXT[waiterLanguage];
 input.placeholder=t.placeholder;
 endBtn.textContent=t.end;
 document.querySelector('#recordHint').textContent=t.hint;
 transcript.innerHTML='';
 permissionHelp.classList.remove('show');
 conversationHistory=[];

 status.textContent=
   waiterLanguage==='ar'?'شغلت المايك، تكلم على طول…':
   waiterLanguage==='fr'?'Activation du micro…':
   'Turning on the microphone…';

 await unlockSpeechAudio();
 if(saraEngine==='alt') await startAltSara(); else if(saraEngine==='agent') await startAgent2(); else if(isBrainSaraEngine()) await startHybrid3(); else await startRealtime();
});

function addBubble(role,text){
 const b=document.createElement('div'); b.className='bubble '+role;
 b.dir=/[\u0600-\u06FF]/.test(text)?'rtl':'ltr';
 const raw=String(text||'');
 const phoneRe=/(?:\+|00)?[0-9٠-٩۰-۹][0-9٠-٩۰-۹\s().-]{6,}[0-9٠-٩۰-۹]/g;
 let last=0, match;
 while((match=phoneRe.exec(raw))){
   if(match.index>last) b.appendChild(document.createTextNode(raw.slice(last,match.index)));
   const iso=document.createElement('bdi');
   iso.dir='ltr';
   iso.style.unicodeBidi='isolate';
   iso.style.direction='ltr';
   iso.style.display='inline-block';
   iso.textContent=match[0];
   b.appendChild(iso);
   last=match.index+match[0].length;
 }
 if(last<raw.length) b.appendChild(document.createTextNode(raw.slice(last)));
 transcript.appendChild(b); transcript.scrollTop=transcript.scrollHeight;
}
function compactMenu(){
 const lang=waiterLanguage||siteLanguage||'ar';
 return menu.map(s=>({
   category:menuCategory(s.cat,lang),
   items:s.items.map(d=>({
     name:translateMenuText(d[0],lang),
     description:translateMenuText(d[1],lang),
     price:lang==='ar'?displayPrice(d[2],'ar'):d[2],
     available:d[4]?.available!==false,
     calories:d[4]?.calories??null,
     modifiers:(Array.isArray(d[4]?.modifiers)?d[4].modifiers:[]).map(m=>({type:m.type,name:m.name,price:m.priceText?(lang==='ar'?displayPrice(m.priceText,'ar'):m.priceText):''}))
   }))
 }));
}

function friendlyApiError(data,statusCode){
 const t=TEXT[waiterLanguage]||TEXT.en;
 const code=(data&&data.code)||'';
 const msg=(data&&(data.message||data.error))||'';
 if(statusCode===401 || code==='invalid_api_key') return t.apiKeyError;
 if(statusCode===403 || code==='model_not_found' || code==='permission_denied') return t.permissionError;
 if(statusCode===429 || code==='insufficient_quota' || /quota|billing|credit/i.test(msg)) return t.quotaError;
 return msg || t.serverError;
}
function showDiagnostic(message,ok=false){
 const box=document.querySelector('#diagBox');
 if(!box)return;
 box.style.display='block';
 box.style.background=ok?'#f0fff4':'#fff5f5';
 box.style.borderColor=ok?'#9ae6b4':'#fed7d7';
 box.style.color=ok?'#22543d':'#742a2a';
 box.textContent=message;
}
async function runDiagnostics(){
 try{
   const r=await fetch('/api/diagnostics',{cache:'no-store'});
   const data=await r.json().catch(()=>({}));
   if(r.ok && data.ok){
     showDiagnostic(
       waiterLanguage==='ar'?'✅ اتصال AI جاهز':
       waiterLanguage==='fr'?'✅ Connexion AI prête':'✅ AI connection ready',
       true
     );
     return true;
   }
   showDiagnostic(friendlyApiError(data,r.status),false);
   return false;
 }catch(e){
   showDiagnostic((TEXT[waiterLanguage]||TEXT.en).serverError,false);
   return false;
 }
}

async function fetchJSON(url,options,timeout=45000){
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
 try{
   const r=await fetch(url,{...options,signal:controller.signal});
   const data=await r.json().catch(()=>({}));
   if(!r.ok){
     const err=new Error(friendlyApiError(data,r.status));
     err.status=r.status; err.data=data; throw err;
   }
   return data;
 }finally{clearTimeout(timer)}
}
async function askAI(question){
 return fetchJSON('/api/ai',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({question,dish:null,menu:compactMenu(),history:conversationHistory.slice(-10),language:waiterLanguage})
 });
}


function stopAISpeech(){
  try{
    if(typeof speechSource!=='undefined' && speechSource){
      try{speechSource.stop();}catch(e){}
      speechSource=null;
    }
    if(currentAudio){
      try{currentAudio.pause();currentAudio.currentTime=0;}catch(e){}
      currentAudio=null;
    }
    orb.classList.remove('speaking');
  }catch(e){
    console.warn('Could not stop AI speech',e);
  }
}

async function unlockSpeechAudio(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return false;
    if(!speechAudioContext) speechAudioContext=new AC();
    if(speechAudioContext.state==='suspended') await speechAudioContext.resume();

    // Start a silent buffer while we are still inside a real user gesture.
    const b=speechAudioContext.createBuffer(1,1,22050);
    const s=speechAudioContext.createBufferSource();
    s.buffer=b;
    s.connect(speechAudioContext.destination);
    s.start(0);
    speechUnlocked=true;
    return true;
  }catch(e){
    console.warn("Audio unlock failed:",e);
    return false;
  }
}

async function speakAI(text){
  try{
    const clean=String(text||'').trim();
    if(!clean) return;
    if(isBrainSaraEngine()) altLastSpokenText=clean;

    if(currentAudio){
      try{currentAudio.pause();}catch(e){}
      currentAudio=null;
    }
    if(typeof speechSource !== 'undefined' && speechSource){
      try{speechSource.stop();}catch(e){}
      speechSource=null;
    }

    const ttsEndpoint='/api/tts';
    const r=await fetch(ttsEndpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:clean,language:waiterLanguage})
    });

    if(!r.ok){
      const data=await r.json().catch(()=>({}));
      throw new Error(data.message||data.error||('TTS HTTP '+r.status));
    }

    const blob=await r.blob();
    if(!blob.size) throw new Error('TTS returned an empty audio file');

    // Safari/iOS: decode and play through the AudioContext unlocked by the user's tap.
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      if(AC){
        if(!speechAudioContext) speechAudioContext=new AC();
        if(speechAudioContext.state==='suspended') await speechAudioContext.resume();

        const bytes=await blob.arrayBuffer();
        const decoded=await speechAudioContext.decodeAudioData(bytes.slice(0));
        speechSource=speechAudioContext.createBufferSource();
        speechSource.buffer=decoded;
        speechSource.connect(speechAudioContext.destination);
        orb.classList.add('speaking');
        if(isBrainSaraEngine()){altSpeaking=true;altTtsStartedAt=performance.now();altBargeCandidateAt=0;}
        speechSource.onended=()=>{
          orb.classList.remove('speaking');
          speechSource=null;
          if(isBrainSaraEngine()){altSpeaking=false;altTtsEndedAt=performance.now();altBargeCandidateAt=0;}
        };
        speechSource.start(0);
        return;
      }
    }catch(webAudioError){
      console.warn("WebAudio playback failed:",webAudioError);
    }

    // Fallback for Chrome/Firefox/other browsers.
    const url=URL.createObjectURL(blob);
    const audio=new Audio();
    currentAudio=audio;
    audio.preload='auto';
    audio.playsInline=true;
    audio.src=url;
    orb.classList.add('speaking');
    if(isBrainSaraEngine()){altSpeaking=true;altTtsStartedAt=performance.now();altBargeCandidateAt=0;}

    audio.onended=()=>{
      orb.classList.remove('speaking');
      URL.revokeObjectURL(url);
      if(currentAudio===audio) currentAudio=null;
      if(isBrainSaraEngine()){altSpeaking=false;altTtsEndedAt=performance.now();altBargeCandidateAt=0;}
    };
    audio.onerror=()=>{
      orb.classList.remove('speaking');
      if(isBrainSaraEngine()){altSpeaking=false;altTtsEndedAt=performance.now();altBargeCandidateAt=0;}
      URL.revokeObjectURL(url);
    };

    await audio.play();
  }catch(e){
    console.error("TTS playback error:",e);
    orb.classList.remove('speaking');

    const msg=
      waiterLanguage==='ar'
        ? 'الرد النصي يعمل، لكن تشغيل الصوت فشل: '+(e.message||'خطأ غير معروف')
        : waiterLanguage==='fr'
        ? "Le texte fonctionne, mais l'audio a échoué : "+(e.message||'Erreur inconnue')
        : 'Text works, but audio playback failed: '+(e.message||'Unknown error');

    showDiagnostic(msg,false);
    status.textContent=msg;
  }
}
async function submitQuestion(q){
 q=(q||'').trim(); if(!q)return;
 addBubble('user',q); conversationHistory.push({role:'user',content:q});
 input.value=''; input.disabled=true; micBtn.disabled=true; status.textContent=TEXT[waiterLanguage].thinking;
 try{
  const data=await askAI(q);
  const answer=String((data&&data.answer)||'').trim();
  if(!answer){
    throw new Error(
      waiterLanguage==='ar'?'لم تصل إجابة من النادلة. حاول مرة أخرى.':
      waiterLanguage==='fr'?"Aucune réponse reçue. Réessayez.":
      'No answer was received. Please try again.'
    );
  }
  addBubble('assistant',answer); conversationHistory.push({role:'assistant',content:answer});
  status.textContent=TEXT[waiterLanguage].ready; await speakAI(answer);
 }catch(e){
  console.error(e);
  const message=e.message||TEXT[waiterLanguage].aiError;
  status.textContent=message;
  showDiagnostic(message,false);
 }
 finally{input.disabled=false;micBtn.disabled=false;}
}
input.addEventListener('keydown',async e=>{
 if(e.key==='Enter'){
   stopAISpeech();
   await unlockSpeechAudio();
   if(saraEngine==='alt'||isBrainSaraEngine()) submitAltQuestion(input.value); else if(saraEngine==='agent'){ const q=String(input.value||'').trim(); if(q&&agent2Conversation){ input.value=''; try{agent2Conversation.sendUserMessage(q);}catch(e){showDiagnostic(e.message||String(e),false);} } } else submitQuestion(input.value);
 }
});

function bestMime(){
 if(!window.MediaRecorder)return '';
 const types=['audio/mp4','audio/webm;codecs=opus','audio/webm'];
 return types.find(t=>MediaRecorder.isTypeSupported?.(t))||'';
}
function stopVAD(){
 if(vadFrame){cancelAnimationFrame(vadFrame);vadFrame=null;}
 if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}
 analyser=null; speechStarted=false; speechStartAt=0; silenceStartAt=0;
}
function startVAD(){
 if(!stream || !(window.AudioContext||window.webkitAudioContext)) return;
 const AC=window.AudioContext||window.webkitAudioContext;
 audioContext=new AC();
 const source=audioContext.createMediaStreamSource(stream);
 analyser=audioContext.createAnalyser();
 analyser.fftSize=1024; analyser.smoothingTimeConstant=.25; source.connect(analyser);
 const data=new Uint8Array(analyser.fftSize);
 const tick=()=>{
  if(!recording||!analyser)return;
  analyser.getByteTimeDomainData(data);
  let sum=0;
  for(let i=0;i<data.length;i++){const x=(data[i]-128)/128;sum+=x*x;}
  const rms=Math.sqrt(sum/data.length), now=performance.now();
  if(rms>SPEECH_THRESHOLD){
   if(!speechStarted){speechStarted=true;speechStartAt=now;}
   silenceStartAt=0;
  }else if(speechStarted && now-speechStartAt>=MIN_SPEECH_MS){
   if(!silenceStartAt)silenceStartAt=now;
   if(now-silenceStartAt>=SILENCE_MS){stopRecording();return;}
  }
  vadFrame=requestAnimationFrame(tick);
 };
 vadFrame=requestAnimationFrame(tick);
}
async function startRecording(){
 permissionHelp.classList.remove('show');
 if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){
  status.textContent=TEXT[waiterLanguage].micError; permissionHelp.textContent=TEXT[waiterLanguage].permission; permissionHelp.classList.add('show'); return;
 }
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false}});
  chunks=[]; const mime=bestMime(); recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  recorder.onstop=sendVoice;
  recorder.start(250); recording=true; micBtn.classList.add('recording'); micBtn.textContent='⏹'; status.textContent=TEXT[waiterLanguage].recording;
  startVAD();
 }catch(e){
  console.error(e); status.textContent=TEXT[waiterLanguage].micError; permissionHelp.textContent=TEXT[waiterLanguage].permission; permissionHelp.classList.add('show');
 }
}
function stopRecording(){
 if(!recording)return;
 recording=false; stopVAD(); micBtn.classList.remove('recording'); micBtn.textContent='🎤';
 if(recorder&&recorder.state!=='inactive')recorder.stop();
}
async function sendVoice(){
 try{
  status.textContent=TEXT[waiterLanguage].transcribing; micBtn.disabled=true;
  const mime=recorder.mimeType||'audio/webm'; const ext=mime.includes('mp4')?'m4a':'webm';
  const blob=new Blob(chunks,{type:mime});
  if(blob.size<800) throw new Error('Recording too short');
  const form=new FormData(); form.append('audio',blob,'voice.'+ext); form.append('language',waiterLanguage);
  const r=await fetch('/api/transcribe',{method:'POST',body:form});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.text){
   const err=new Error(friendlyApiError(data,r.status));
   err.status=r.status; throw err;
  }
  await submitQuestion(data.text);
 }catch(e){
  console.error(e); status.textContent=e.message||TEXT[waiterLanguage].serverError; showDiagnostic(status.textContent,false);
 }finally{
  micBtn.disabled=false; chunks=[];
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
 }
}
micBtn.onclick=()=>{
 if(saraEngine==='agent'){
   if(!agent2Conversation)return;
   agent2MicMuted=!agent2MicMuted;
   try{agent2Conversation.setMicMuted(agent2MicMuted);}catch(e){}
   micBtn.textContent=agent2MicMuted?'🔇':'🎤';
   status.textContent=agent2MicMuted?(waiterLanguage==='ar'?'المايك مكتوم':waiterLanguage==='fr'?'Micro coupé':'Microphone muted'):TEXT[waiterLanguage].ready;
   return;
 }
 if(saraEngine==='alt'||isBrainSaraEngine()){
   if(!altStream)return;
   const track=altStream.getAudioTracks()[0];if(!track)return;track.enabled=!track.enabled;micBtn.textContent=track.enabled?'🎤':'🔇';
   status.textContent=track.enabled?TEXT[waiterLanguage].ready:(waiterLanguage==='ar'?'المايك مكتوم':waiterLanguage==='fr'?'Micro coupé':'Microphone muted');
   return;
 }
 if(!realtimeMicStream) return;
 const track=realtimeMicStream.getAudioTracks()[0];
 if(!track) return;
 track.enabled=!track.enabled;
 micBtn.textContent=track.enabled?'🎤':'🔇';
 status.textContent=
   track.enabled
     ?TEXT[waiterLanguage].ready
     :(waiterLanguage==='ar'?'المايك مكتوم':waiterLanguage==='fr'?'Micro coupé':'Microphone muted');
};


const BOOKING_TEXT={
 ar:{button:'📅 احجز طاولة',title:'حجز طاولة',sub:'احجز موعدك وسنذكّرك على واتساب قبل 30 دقيقة.',name:'الاسم',phone:'رقم واتساب',people:'عدد الأشخاص',date:'التاريخ',time:'الوقت',notes:'ملاحظات (اختياري)',submit:'تأكيد الحجز',saving:'جاري حفظ الحجز…',note:'اكتب رقم واتساب بصيغة دولية. التذكير يرسل قبل الموعد بـ30 دقيقة.',success:(r)=>`تم الحجز ✅ رقم الحجز: ${r.code} — ${r.date} الساعة ${r.time}. سنرسل تذكير واتساب قبل الموعد بـ30 دقيقة.`,error:'تعذر حفظ الحجز الآن.'},
 fr:{button:'📅 Réserver une table',title:'Réserver une table',sub:'Réservez et recevez un rappel WhatsApp 30 minutes avant.',name:'Nom',phone:'Numéro WhatsApp',people:'Nombre de personnes',date:'Date',time:'Heure',notes:'Notes (facultatif)',submit:'Confirmer',saving:'Enregistrement…',note:'Utilisez le format international, par ex. +216… ou +33…',success:(r)=>`Réservation confirmée ✅ N° ${r.code} — ${r.date} à ${r.time}. Rappel WhatsApp 30 min avant.`,error:'Impossible d’enregistrer la réservation.'},
 en:{button:'📅 Reserve a table',title:'Reserve a table',sub:'Book now and get a WhatsApp reminder 30 minutes before.',name:'Name',phone:'WhatsApp number',people:'Guests',date:'Date',time:'Time',notes:'Notes (optional)',submit:'Confirm booking',saving:'Saving…',note:'Use international format, e.g. +966… or +216…',success:(r)=>`Booking confirmed ✅ Code: ${r.code} — ${r.date} at ${r.time}. WhatsApp reminder 30 minutes before.`,error:'Could not save the reservation.'}
};
function applyBookingLanguage(lang){
 const t=BOOKING_TEXT[lang]||BOOKING_TEXT.ar;
 const map={bookingBtn:t.button,bookingTitle:t.title,bookingSubtitle:t.sub,bookingNameLabel:t.name,bookingPhoneLabel:t.phone,bookingPeopleLabel:t.people,bookingDateLabel:t.date,bookingTimeLabel:t.time,bookingNotesLabel:t.notes,bookingSubmit:t.submit,bookingNote:t.note};
 Object.entries(map).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value;});
}
function setBookingMinDate(){
 const input=document.getElementById('bookingDate'); if(!input)return;
 const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0');
 input.min=`${y}-${m}-${day}`;
}
(function initBookingUI(){
 const btn=document.getElementById('bookingBtn'), modalEl=document.getElementById('bookingModal'), close=document.getElementById('bookingClose'), form=document.getElementById('bookingForm');
 const people=document.getElementById('bookingPeople'), errorBox=document.getElementById('bookingError'), resultBox=document.getElementById('bookingResult'), submit=document.getElementById('bookingSubmit');
 if(!btn||!modalEl||!form)return;
 for(let i=1;i<=20;i++){const o=document.createElement('option');o.value=String(i);o.textContent=String(i);if(i===2)o.selected=true;people.appendChild(o);}
 const open=()=>{setBookingMinDate();applyBookingLanguage(siteLanguage||'ar');errorBox.classList.remove('show');resultBox.classList.remove('show');modalEl.classList.add('show');modalEl.setAttribute('aria-hidden','false');setTimeout(()=>document.getElementById('bookingName')?.focus(),50);};
 const hide=()=>{modalEl.classList.remove('show');modalEl.setAttribute('aria-hidden','true');};
 btn.addEventListener('click',open); close.addEventListener('click',hide); modalEl.addEventListener('click',e=>{if(e.target===modalEl)hide();});
 form.addEventListener('submit',async e=>{
   e.preventDefault(); errorBox.classList.remove('show'); resultBox.classList.remove('show');
   const lang=siteLanguage||'ar', t=BOOKING_TEXT[lang]||BOOKING_TEXT.ar;
   const payload={name:document.getElementById('bookingName').value.trim(),phone:document.getElementById('bookingPhone').value.trim(),partySize:Number(people.value),date:document.getElementById('bookingDate').value,time:document.getElementById('bookingTime').value,notes:document.getElementById('bookingNotes').value.trim(),language:lang};
   submit.disabled=true; submit.textContent=t.saving;
   try{
     const r=await fetch('/api/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
     const data=await r.json().catch(()=>({}));
     if(!r.ok||!data.reservation) throw new Error(data.message||t.error);
     resultBox.textContent=t.success(data.reservation); resultBox.classList.add('show');
     form.reset(); people.value='2'; setBookingMinDate();
   }catch(err){errorBox.textContent=err.message||t.error;errorBox.classList.add('show');}
   finally{submit.disabled=false;submit.textContent=t.submit;}
 });
 applyBookingLanguage(siteLanguage||'ar'); setBookingMinDate();
})();

function closeWaiter(){
 closeAgent2();
 closeAltSara();
 closeRealtime();
 stopVAD();
 if(recording) stopRecording();
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
 if(currentAudio){currentAudio.pause();currentAudio=null;}
 modal.classList.remove('show'); currentDish=null; conversationHistory=[];
}
endBtn.onclick=closeWaiter;
