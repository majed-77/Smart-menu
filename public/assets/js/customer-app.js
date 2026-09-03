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
let currentDish=null;
let conversationHistory=[];
let currentAudio=null;
let saraStream=null, saraAnalyser=null, saraAudioContext=null, saraVadFrame=null, saraRecorder=null, saraChunks=[];
let saraCapturing=false, saraSpeechStartedAt=0, saraSilenceAt=0, saraBusy=false, saraSpeaking=false, saraStarted=false;
let saraNoiseFloor=0.012, saraNoiseReadyAt=0, saraNoiseLastUpdate=0, saraVoiceCandidateAt=0;

const welcomeOverlay=document.querySelector('#welcomeOverlay');
const nav=document.querySelector('#nav'), root=document.querySelector('#menu');
const modal=document.querySelector('#modal'), waiterLangStep=document.querySelector('#waiterLangStep'), chatStep=document.querySelector('#chatStep');
const title=document.querySelector('#modalDish'), orb=document.querySelector('#orb'), status=document.querySelector('#status');
const transcript=document.querySelector('#transcript'), input=document.querySelector('#askInput'), micBtn=document.querySelector('#micBtn');
const endBtn=document.querySelector('#end'), cancelWaiter=document.querySelector('#cancelWaiter'), permissionHelp=document.querySelector('#permissionHelp');


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
  return hasApprove || (hasYes && (bookingWord || saraAwaitingBookingApproval()));
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
function closeSara(){
  saraStarted=false; saraBusy=false; saraSpeaking=false; saraCapturing=false; saraBookingState={name:'',phone:'',partySize:null,date:'',time:'',notes:'',orderItems:[]}; saraBookingActive=false; saraLastConfirmedBooking={signature:'',code:'',at:0}; saraBookingSaveInFlight=false; saraBargeCandidateAt=0; saraCaptureStartedDuringSara=false; saraLastSpokenText=''; saraSpeechStoppedAt=0; saraVoiceProcessInFlight=false; saraLastTurnFingerprint=''; saraLastTurnAt=0;
  if(saraVadFrame){cancelAnimationFrame(saraVadFrame);saraVadFrame=null;}
  try{if(saraRecorder && saraRecorder.state!=="inactive")saraRecorder.stop();}catch(e){}
  saraRecorder=null; saraChunks=[];
  if(saraStream){try{saraStream.getTracks().forEach(t=>t.stop());}catch(e){} saraStream=null;}
  if(saraAudioContext){try{saraAudioContext.close();}catch(e){} saraAudioContext=null;}
  saraAnalyser=null;
  stopAISpeech();
}

async function saraFetchJSON(url, options, timeout=45000){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(url,{...options,signal:controller.signal});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.message||data.error||`HTTP ${r.status}`);
    return data;
  }finally{clearTimeout(timer)}
}


let saraBookingState={name:'',phone:'',partySize:null,date:'',time:'',notes:'',orderItems:[]};
let saraBookingActive=false;
let saraLastConfirmedBooking={signature:'',code:'',at:0};
let saraBookingSaveInFlight=false;
let saraBargeCandidateAt=0;
let saraTtsStartedAt=0;
let saraTtsEndedAt=0;
let saraLastSpokenText='';
let saraCaptureStartedDuringSara=false;
let saraSpeechStoppedAt=0;
// One voice turn must produce exactly one transcript/AI reply. iOS Safari can
// fire VAD/MediaRecorder transitions very close together, so keep an explicit
// processing lock and a short transcript de-duplication window.
let saraVoiceProcessInFlight=false;
let saraLastTurnFingerprint='';
let saraLastTurnAt=0;
function saraTurnFingerprint(text){
  return String(text||'').toLowerCase().replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').replace(/[^\u0600-\u06FF0-9a-z+ ]/gi,' ').replace(/\s+/g,' ').trim();
}
function saraIsDuplicateTurn(text){
  const fp=saraTurnFingerprint(text), now=Date.now();
  if(!fp)return false;
  if(fp===saraLastTurnFingerprint && now-saraLastTurnAt<4500)return true;
  saraLastTurnFingerprint=fp; saraLastTurnAt=now; return false;
}
function normalizeArabicDigitsSara(v){return String(v||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));}
function saraTodayISO(){try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>parts.find(p=>p.type===t)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`;}catch(e){return new Date(Date.now()+3*3600000).toISOString().slice(0,10)}}
function saraPhoneDigitsFromSpeech(raw){
  raw=normalizeArabicDigitsSara(String(raw||'')).replace(/[،,.;:!?؟]/g,' ').replace(/\s+/g,' ').trim();
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
function saraAwaitingPhoneNumber(){
  const last=[...conversationHistory].reverse().find(m=>m?.role==='assistant');
  const t=String(last?.content||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(رقم الجوال|رقم الواتساب|واتساب عشان|الجوال أو الواتساب|الجوال او الواتساب)/.test(t);
}
function saraNormalizePhoneTranscriptForDisplay(text){
  const raw=String(text||'').trim();
  const phone=saraPhoneDigitsFromSpeech(raw);
  if(!phone)return raw;
  if(saraAwaitingPhoneNumber() || saraIsPhoneCorrection(raw)) return phone;
  return raw;
}
function saraAwaitingPartySize(){
  const last=[...conversationHistory].reverse().find(m=>m?.role==='assistant');
  const t=String(last?.content||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(الحجز|حجز).{0,18}(كم|لكم).{0,12}(شخص|اشخاص)|(?:كم|لكم).{0,12}(شخص|اشخاص)/.test(t);
}
function saraAwaitingBookingName(){
  const last=[...conversationHistory].reverse().find(m=>m?.role==='assistant');
  const t=String(last?.content||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(وش الاسم|ايش الاسم|اسم الحجز|الاسم اللي اسجل|الاسم الذي اسجل)/.test(t);
}
function saraBookingContextActive(){
  if(saraBookingActive)return true;
  const a=saraBookingArgsFromState();
  if(a.name||a.phone||a.party_size||a.date||a.time)return true;
  const recent=conversationHistory.slice(-8).map(m=>String(m?.content||'')).join(' ')
    .replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(احجز|حجز|الحجز|طاولة|وش الاسم|اسم الحجز|رقم الجوال|رقم الواتساب|الحجز لكم شخص|اي يوم|الساعة كم)/.test(recent);
}
function saraExtractBookingName(raw){
  const text=String(raw||'').replace(/[،,.!?؟]+$/g,'').trim();
  let m=text.match(/(?:اسم(?:\s+الحجز)?|اسمي|باسم)\s+([\u0600-\u06FF]{2,})(?=\s+(?:رقم|والرقم|واتساب|رقم الواتساب|لـ|لشخص|اليوم|بكره|غدا|غدًا|الساعة)|$)/i);
  if(m)return m[1];
  if(saraAwaitingBookingName()){
    // "اسم ماجد" / "ماجد" / "أنا ماجد" should be accepted locally.
    m=text.match(/^(?:انا\s+|أنا\s+)?(?:اسمي\s+|اسم\s+)?([\u0600-\u06FF]{2,})(?:\s+.*)?$/i);
    if(m && !/(اعتمد|تمام|نعم|ايه|حجز|واتساب|جوال|رقم)/.test(m[1])) return m[1];
  }
  return '';
}
function saraUpdateBookingState(text,role='user'){
  let raw=normalizeArabicDigitsSara(String(text||'')).replace(/\s+/g,' ').trim(); if(!raw)return;
  if(role==='user' && /(?:احجز|أحجز|حجز|الحجز|حجزت|حجزي|طاولة)/.test(raw)) saraBookingActive=true;
  const phone=saraPhoneDigitsFromSpeech(raw);
  if(phone)saraBookingState.phone=phone;
  const rawForNames=raw.replace(/[،,.!?؟]+$/g,'').trim();
  let m=null;
  if(role==='user'){
    const extractedName=saraExtractBookingName(rawForNames);
    if(extractedName)saraBookingState.name=extractedName;
  }
  // Sara's booking summary is also authoritative context. Keep the same booking state
  // instead of making the guest repeat their name at final confirmation.
  if(role==='assistant'&&!saraBookingState.name){
    m=raw.match(/(?:^|[،,.]\s*)تمام\s+([\u0600-\u06FF]{2,})(?=[،,.\s])/);
    if(m&&!/(حجز|الحجز|تمام|اكيد|أكيد)/.test(m[1]))saraBookingState.name=m[1];
  }
  if(role==='user'&&!saraBookingState.name&&saraAwaitingBookingName()){
    m=rawForNames.match(/^([\u0600-\u06FF]{2,})$/); if(m&&!/(اعتمد|تمام|نعم|ايه|حجز|واتساب|جوال|رقم)/.test(m[1]))saraBookingState.name=m[1];
  }
  m=raw.match(/(?:ل|لـ)?(\d{1,2})\s*(?:اشخاص|أشخاص|شخص)/); if(m)saraBookingState.partySize=Math.max(1,Math.min(30,Number(m[1])));
  if(/(?:ل|لـ)?شخصين/.test(raw)) saraBookingState.partySize=2;
  // Saudi speech often uses the cardinal stem with "أشخاص" (e.g. "ثلاث
  // أشخاص", "أربع أشخاص") rather than the form expected by formal Arabic.
  // Accept both forms so a correctly transcribed answer is never discarded.
  const partyWords={'واحد':1,'واحدة':1,'اثنين':2,'إثنين':2,'ثنين':2,'ثنتين':2,'ثلاث':3,'ثلاثة':3,'ثلاثه':3,'اربع':4,'أربع':4,'اربعة':4,'أربعة':4,'اربعه':4,'خمس':5,'خمسة':5,'خمسه':5,'ست':6,'ستة':6,'سته':6,'سبع':7,'سبعة':7,'سبعه':7,'ثمان':8,'ثمانية':8,'ثمانيه':8,'تسع':9,'تسعة':9,'تسعه':9,'عشر':10,'عشرة':10,'عشره':10};
  for(const [w,n] of Object.entries(partyWords)){
    if(new RegExp(`(?:ل|لـ)?${w}\\s+(?:اشخاص|أشخاص|اشخاصًا|أشخاصًا|شخص)`).test(raw)){saraBookingState.partySize=n;break;}
  }
  // If Sara has explicitly just asked "الحجز لكم شخص؟", a short answer like
  // "ثلاث" or "3" is unambiguously the party size and should be stored.
  if(role==='user' && !saraBookingState.partySize && saraAwaitingPartySize()){
    const compact=raw.replace(/[،,.!?؟]/g,'').trim();
    if(/^\d{1,2}$/.test(compact)) saraBookingState.partySize=Math.max(1,Math.min(30,Number(compact)));
    else if(partyWords[compact]) saraBookingState.partySize=partyWords[compact];
  }
  if(/(?:^|\s|[،,.!?؟])اليوم(?=$|\s|[،,.!?؟])/.test(raw))saraBookingState.date=saraTodayISO();
  const iso=(raw.match(/\b20\d{2}-\d{2}-\d{2}\b/)||[])[0]; if(iso)saraBookingState.date=iso;
  m=raw.match(/الساعة\s*(\d{1,2})(?::(\d{2}))?\s*(?:و?نص(?:ف)?|و?نصف)?\s*(صباح(?:ا|ًا)?|مساء(?:ً|ا|ًا)?|ظهر(?:ا|ًا)?|بالليل|ليل(?:ا|ًا)?|المغرب)?/);
  if(m){
    let h=Number(m[1]),min=Number(m[2]||0),ap=m[3]||'';
    if(!m[2]&&/(?:و?نص(?:ف)?|و?نصف)/.test(m[0]))min=30;
    const isPm=/(?:مساء|بالليل|ليل|المغرب)/.test(ap)||/(?:مساء|بالليل|ليل|المغرب)/.test(raw);
    const isAm=/صباح/.test(ap)||/صباح/.test(raw);
    if(isPm&&h<12)h+=12;
    if(isAm&&h===12)h=0;
    saraBookingState.time=String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');
  }
  const hourWords={'واحدة':1,'وحدة':1,'الواحدة':1,'الواحده':1,'اثنتين':2,'ثنتين':2,'اثنين':2,'الاثنتين':2,'الثنتين':2,'ثلاثة':3,'ثلاثه':3,'الثلاثة':3,'الثلاثه':3,'أربعة':4,'اربعة':4,'الأربعة':4,'الاربعة':4,'خمسة':5,'خمسه':5,'الخمسة':5,'الخمسه':5,'ستة':6,'سته':6,'الستة':6,'السته':6,'سبعة':7,'سبعه':7,'السبعة':7,'السبعه':7,'ثمانية':8,'ثمانيه':8,'الثمانية':8,'الثمانيه':8,'تسعة':9,'تسعه':9,'التسعة':9,'التسعه':9,'عشرة':10,'عشره':10,'العشرة':10,'العشره':10,'احدعش':11,'احد عشر':11,'إحدى عشرة':11,'احدى عشرة':11,'الحادية عشرة':11,'الحاديه عشره':11,'اثنتا عشرة':12,'اثنا عشر':12,'الثانية عشرة':12,'الثانيه عشره':12};
  for(const [w,h0] of Object.entries(hourWords)){
    const hm=raw.match(new RegExp(`(?:الساعة|الساعه)\\s+${w}(?:\\s+(?:و?نص(?:ف)?|و?نصف))?`));
    if(hm){
      let h=h0,min=/(?:و?نص(?:ف)?|و?نصف)/.test(hm[0])?30:0;
      if(/(?:مساء|المسا|بالليل|ليل|المغرب)/.test(raw)&&h<12)h+=12;
      if(/صباح/.test(raw)&&h===12)h=0;
      saraBookingState.time=String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');
      break;
    }
  }
  // Safety net for numeric Saudi booking phrases such as "الساعة 10 مساء".
  // Once the guest gives the time, persist it in bookingState so later steps
  // (name/phone) can never cause Sara to ask for the time again.
  if(role==='user' && !saraBookingState.time && /(?:الساعة|الساعه)/.test(raw)){
    const normalizedHourText=raw.replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا');
    const hm=normalizedHourText.match(/(?:الساعة|الساعه)\s*(\d{1,2})(?::(\d{1,2}))?/);
    if(hm){
      let h=Number(hm[1]),min=Number(hm[2]||0);
      if(/(?:مساء|المسا|بالليل|ليل|المغرب)/.test(normalizedHourText)&&h<12)h+=12;
      if(/صباح/.test(normalizedHourText)&&h===12)h=0;
      if(h>=0&&h<=23&&min>=0&&min<=59) saraBookingState.time=String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');
    }
  }
}
function saraBookingArgsFromState(){return {name:saraBookingState.name||'',phone:saraBookingState.phone||'',party_size:Number(saraBookingState.partySize)||0,date:saraBookingState.date||'',time:saraBookingState.time||'',notes:saraBookingState.notes||'',order_items:Array.isArray(saraBookingState.orderItems)?saraBookingState.orderItems:[]};}
function saraApplyPreorderTool(args){
  if(typeof args==='string'){try{args=JSON.parse(args)}catch(e){args={}}}
  if(!args||typeof args!=='object')args={};
  const items=Array.isArray(args.order_items)?args.order_items:[];
  saraBookingState.orderItems=items.map(x=>({
    item_name:String(x?.item_name||'').trim(),
    quantity:Math.max(1,Math.min(20,Number(x?.quantity)||1)),
    special_request:String(x?.special_request||'').trim()
  })).filter(x=>x.item_name);
  saraBookingActive=true;
  const msg=String(args.response_message||'').trim();
  if(msg)return msg;
  return waiterLanguage==='ar'?'أبشر، حفظت طلبك المسبق على نفس الحجز.':waiterLanguage==='fr'?'C’est noté avec votre réservation.':'Got it — I saved that with your reservation.';
}
function saraMergeToolArgs(args){
  const st=saraBookingArgsFromState();
  // Booking state is authoritative for date/time because it was extracted from the
  // guest's actual Arabic phrasing (e.g. "عشرة ونص بالليل" => 22:30).
  // This prevents an LLM tool call from downgrading it back to ambiguous 10:30.
  return {...args,name:String(st.name||args.name||'').trim(),phone:String(st.phone||args.phone||'').trim(),party_size:Number(st.party_size||args.party_size||0),date:String(st.date||args.date||''),time:String(st.time||args.time||''),notes:String(args.notes||st.notes||''),order_items:Array.isArray(args.order_items)&&args.order_items.length?args.order_items:st.order_items};
}

async function askSara(question,{greeting=false}={}){
  return saraFetchJSON('/api/sara-chat',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({question,menu:compactMenu(),history:conversationHistory.slice(-12),language:waiterLanguage,greeting,tableNumber:saraTableNumber,bookingState:!saraTableNumber?saraBookingState:null})
  },60000);
}


async function handleSaraTableOrderTool(toolCall){
  let args={}; try{args=JSON.parse(toolCall?.arguments||'{}')}catch(e){}
  status.textContent=waiterLanguage==='ar'?(saraTableNumber?`لحظة، أرسل طلب طاولة ${saraTableNumber}…`:'لحظة، أرسل طلبك للمطعم…'):'Sending your order…';
  const order=await saveSaraTableOrder(args);
  if(order.orderMode==='dinein') return waiterLanguage==='ar'?`تم، أرسلت طلبك للأكل داخل المطعم. رقم طلبك ${order.code}.`:waiterLanguage==='fr'?`C'est envoyé pour consommation sur place. Numéro ${order.code}.`:`Done. Your dine-in order was sent. Order number ${order.code}.`;
  if(order.orderMode==='external'||!saraTableNumber) return waiterLanguage==='ar'?`تم، أرسلت طلب الاستلام الخارجي للمطعم. رقم طلبك ${order.code}.`:waiterLanguage==='fr'?`C'est envoyé pour emporter. Numéro ${order.code}.`:`Done. Your pickup order was sent. Order number ${order.code}.`;
  return waiterLanguage==='ar'?`تم، أرسلت طلبك للمطعم لطاولة ${order.tableNumber}. رقم طلبك ${order.code}.`:waiterLanguage==='fr'?`C'est envoyé à la table ${order.tableNumber}. Numéro de commande ${order.code}.`:`Done. Your order was sent for table ${order.tableNumber}. Order number ${order.code}.`;
}
function saraBookingSignature(args){
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
async function handleSaraBookingTool(toolCall){
  let args={}; try{args=JSON.parse(toolCall?.arguments||'{}');}catch(e){}
  args=saraMergeToolArgs(args);
  const signature=saraBookingSignature(args);
  if(saraBookingSaveInFlight){
    return waiterLanguage==='ar'?'لحظة، الحجز قاعد ينحفظ الآن.':waiterLanguage==='fr'?`Un instant, la réservation est en cours d’enregistrement.`:`One moment, the booking is being saved.`;
  }
  if(saraLastConfirmedBooking.signature===signature && saraLastConfirmedBooking.code && (Date.now()-saraLastConfirmedBooking.at)<30*60*1000){
    return waiterLanguage==='ar'?`حجزك معتمد مسبقًا. رقم حجزك ${saraLastConfirmedBooking.code}.`:waiterLanguage==='fr'?`Votre réservation est déjà confirmée sous le numéro ${saraLastConfirmedBooking.code}.`:`Your booking is already confirmed. Your booking number is ${saraLastConfirmedBooking.code}.`;
  }
  saraBookingSaveInFlight=true;
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
    saraLastConfirmedBooking={signature,code:String(code),at:Date.now()};
    return waiterLanguage==='ar'?`تم، اعتمدت الحجز${resolved.length?' والطلب':''} بنجاح. رقم حجزك ${code}.`:waiterLanguage==='fr'?`C'est confirmé. La réservation${resolved.length?' et la commande':''} est enregistrée sous le numéro ${code}.`:`Done. Your booking${resolved.length?' and order':''} is confirmed. Your booking number is ${code}.`;
  } finally {
    saraBookingSaveInFlight=false;
  }
}

function stopSaraSpeechForBargeIn(){
  if(!saraSpeaking)return;
  stopAISpeech();
  saraSpeaking=false;
  saraSpeechStoppedAt=performance.now();
  status.textContent=waiterLanguage==='ar'?'سمعتك، كمّل…':waiterLanguage==='fr'?'Je vous écoute…':'I’m listening…';
}

function startSaraCapture({duringSara=false}={}){
  if(!saraStream || saraCapturing || saraVoiceProcessInFlight || (saraBusy && !(saraSpeaking||duringSara)))return;
  saraCaptureStartedDuringSara=Boolean(duringSara);
  const mime=bestMime(); saraChunks=[];
  try{saraRecorder=new MediaRecorder(saraStream,mime?{mimeType:mime}:undefined);}catch(e){return;}
  saraRecorder.ondataavailable=e=>{if(e.data?.size)saraChunks.push(e.data)};
  saraRecorder.onstop=async()=>{
    const rec=saraRecorder; saraRecorder=null; saraCapturing=false;
    const type=rec?.mimeType||mime||'audio/webm'; const blob=new Blob(saraChunks,{type}); saraChunks=[];
    if(blob.size<700){saraVoiceProcessInFlight=false;saraBusy=false;return;}
    await processSaraVoice(blob,type);
  };
  saraRecorder.start(100); saraCapturing=true; saraSpeechStartedAt=performance.now(); saraSilenceAt=0;
  micBtn.classList.add('recording'); micBtn.textContent='⏹';
}

function stopSaraCapture(){
  if(!saraCapturing)return;
  // Lock before MediaRecorder's asynchronous `stop` event. Without this tiny
  // guard, VAD can start a second recorder in the gap and submit the same turn
  // twice on Safari/iOS.
  saraVoiceProcessInFlight=true;
  micBtn.classList.remove('recording'); micBtn.textContent='🎤';
  try{if(saraRecorder&&saraRecorder.state!=='inactive')saraRecorder.stop();else saraVoiceProcessInFlight=false;}catch(e){saraCapturing=false;saraVoiceProcessInFlight=false;}
}

function runSaraVAD(){
  if(!saraAnalyser)return;
  const data=new Uint8Array(saraAnalyser.fftSize);
  const tick=()=>{
    if(!saraStarted||!saraAnalyser)return;
    saraAnalyser.getByteTimeDomainData(data); let sum=0;
    for(let i=0;i<data.length;i++){const x=(data[i]-128)/128;sum+=x*x;}
    const rms=Math.sqrt(sum/data.length), now=performance.now();
    
    

    // Adaptive VAD for Deepgram: a fixed RMS threshold is unreliable across
    // iPhones/Android devices and restaurant noise. Track the ambient floor while
    // idle, require a short voice hold to start, then use a much lower release
    // threshold plus a long hangover so natural pauses do not cut the guest off.
    if(!saraCapturing && !saraSpeaking){
      if(!saraNoiseFloor || !Number.isFinite(saraNoiseFloor))saraNoiseFloor=Math.max(0.004,rms);
      const capped=Math.min(rms,saraNoiseFloor*2.2+0.006);
      saraNoiseFloor=saraNoiseFloor*0.985+capped*0.015;
    }
    const adaptiveStart=Math.min(0.024,Math.max(0.007,saraNoiseFloor*1.38+0.0015));
    const adaptiveKeep=Math.min(0.012,Math.max(0.0038,saraNoiseFloor*1.02+0.0006));
    const startThreshold=adaptiveStart;
    const keepThreshold=adaptiveKeep;
    const minSpeechMs=260;
    const endSilenceMs=1800;
    const startHoldMs=0;
    const canStart=!saraBusy || saraSpeaking;

    if(canStart && !saraCapturing){
      if(saraSpeaking){
        // Separate barge-in detection from end-of-turn detection. A nearby voice
        // can stop Sara, while a short plate/music spike should not.
        const bargeThreshold=0.050, bargeHoldMs=95, ttsGraceMs=180;
        if(now-saraTtsStartedAt>ttsGraceMs && rms>bargeThreshold){
          if(!saraBargeCandidateAt)saraBargeCandidateAt=now;
          if(now-saraBargeCandidateAt>=bargeHoldMs){
            stopSaraSpeechForBargeIn();
            startSaraCapture({duringSara:true});
            saraBargeCandidateAt=0;
          }
        }else saraBargeCandidateAt=0;
      }else if(rms>startThreshold){
        if(!saraVoiceCandidateAt)saraVoiceCandidateAt=now;
        if(now-saraVoiceCandidateAt>=startHoldMs){
          startSaraCapture();
          saraVoiceCandidateAt=0;
        }
      }else saraVoiceCandidateAt=0;
    }

    if(saraCapturing){
      if(rms>keepThreshold){saraSilenceAt=0;}
      else if(now-saraSpeechStartedAt>minSpeechMs){
        if(!saraSilenceAt)saraSilenceAt=now;
        if(now-saraSilenceAt>endSilenceMs)stopSaraCapture();
      }
    }
    saraVadFrame=requestAnimationFrame(tick);
  };
  saraVadFrame=requestAnimationFrame(tick);
}
function saraAwaitingBookingApproval(){
  const last=[...conversationHistory].reverse().find(m=>m?.role==='assistant');
  const t=String(last?.content||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(اعتمد الحجز|اعتمد\?|اثبت الحجز|اكد الحجز|أعتمد الحجز|أعتمد\؟)/.test(String(last?.content||'')) ||
         (/(حجز|الحجز)/.test(t) && /(اعتمد|اكد|ثبت)/.test(t));
}
function saraAwaitingOrderApproval(){
  const last=[...conversationHistory].reverse().find(m=>m?.role==='assistant');
  const t=String(last?.content||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(اعتمد الطلب|اعتمد\?|ارسل الطلب|أعتمد الطلب|أعتمد\؟)/.test(String(last?.content||'')) ||
         (/(طلب|الطلب)/.test(t) && /(اعتمد|اكد|ثبت|ارسل)/.test(t));
}
function normalizeSaraBookingApprovalTranscript(text){
  const raw=String(text||'').trim();
  if(!(saraAwaitingBookingApproval()||saraAwaitingOrderApproval())) return raw;
  const t=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[.!؟?،,;:]/g,'').replace(/\s+/g,' ').trim();

  // Respect clear rejections first. This prevents a short foreign STT guess
  // such as "no" from ever being treated as approval.
  if(/^(لا|مو|كلا|no|nope|nah|non)$/.test(t)) return raw;

  // Known short approval variants / common STT guesses.
  if(/^(evet|temet|chatgpt|yes|yeah|yep|yup|ok|okay|si|eh|nem|nem termeszet|oui|ta|da|ja|sim|mhm|uh huh|تمام|نعم|ايه|إيه|اي|اعتمد|اعتمدي)$/.test(t)) return 'اعتمد';

  const approvalHits=(t.match(/اعتمد(?:ي)?|اثبت|أثبت|اكد|أكد|نعم|ايه|إيه|تمام|موافق|evet|yes|si|oui|ta|da|ja|sim/g)||[]).length;
  if(approvalHits>=2 && t.length<140) return 'اعتمد';

  // Sara Arabic mode: one-word confirmations such as "إيه" are
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
function saraCanConfirmBookingNow(){
  const a=saraBookingArgsFromState();
  return Boolean(a.name && a.phone && Number(a.party_size)>0 && a.date && a.time);
}
async function saraConfirmBookingDirectly(){
  const args=saraBookingArgsFromState();
  return handleSaraBookingTool({name:'confirm_booking_order',arguments:JSON.stringify(args)});
}

function saraIsRepeatPhoneRequest(text){
  const t=String(text||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(اعد|اعيد|عيد|كرر|قولي|قول).*?(رقم|واتساب)|(?:رقم|واتساب).*?(مره ثانيه|مرة ثانية|من جديد|اعد|اعيد|كرر)/.test(t);
}
function saraIsPhoneCorrection(text){
  const t=String(text||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(الرقم|واتساب).*(غلط|خطا|مو صح|غير صحيح|الصحيح|عدل|صحح|غير)|(?:غلط|خطا).*(الرقم|واتساب)/.test(t);
}
function saraPhoneDisplay(phone){return String(phone||'').replace(/\s+/g,'');}
function saraBookingDateDisplay(date){
  const d=String(date||'').trim();
  if(!d)return '';
  return d===saraTodayISO()?'اليوم':d;
}
function saraBookingTimeDisplay(time){
  const m=String(time||'').trim().match(/^(\d{1,2}):(\d{2})$/);
  if(!m)return String(time||'').trim();
  return `${String(Number(m[1])).padStart(2,'0')}:${m[2]}`;
}
function saraArabicHourWord(h){
  const hours={0:'اثنتي عشرة',1:'واحدة',2:'اثنتين',3:'ثلاثة',4:'أربعة',5:'خمسة',6:'ستة',7:'سبعة',8:'ثمانية',9:'تسعة',10:'عشرة',11:'إحدى عشرة',12:'اثنتي عشرة'};
  const h12=((Number(h)%24)+24)%24%12;
  return hours[h12]||String(h);
}
function saraArabicMinuteWords(min){
  const n=Number(min)||0;
  if(n===0)return '';
  if(n===5)return 'وخمس دقايق';
  if(n===10)return 'وعشر دقايق';
  if(n===15)return 'وربع';
  if(n===20)return 'وعشرين دقيقة';
  if(n===25)return 'وخمسة وعشرين دقيقة';
  if(n===30)return 'ونص';
  if(n===35)return 'وخمسة وثلاثين دقيقة';
  if(n===40)return 'وأربعين دقيقة';
  if(n===45)return 'إلا ربع';
  if(n===50)return 'إلا عشر دقايق';
  if(n===55)return 'إلا خمس دقايق';
  return `و${n} دقيقة`;
}
function saraTimeForSpeech(time){
  const m=String(time||'').trim().match(/^(\d{1,2}):(\d{2})$/);
  if(!m)return String(time||'').trim();
  return `${saraArabicHourWord(Number(m[1]))}${saraArabicMinuteWords(Number(m[2]))}`;
}
function saraPrepareSpeechText(text){
  let out=String(text||'');
  out=out.replace(/الساعة\s+(\d{1,2}:\d{2})/g,(_,t)=>`الساعة ${saraTimeForSpeech(t)}`);
  // Keep phone numbers numeric on-screen, but pronounce them digit by digit.
  out=out.replace(/(?<!\d)(\+?\d{8,15})(?!\d)/g,m=>saraPhoneWords(m));
  return out;
}
function saraPhoneWords(phone){
  const m={'0':'صفر','1':'واحد','2':'اثنين','3':'ثلاثة','4':'أربعة','5':'خمسة','6':'ستة','7':'سبعة','8':'ثمانية','9':'تسعة','+':'زائد'};
  return String(phone||'').split('').filter(ch=>m[ch]).map(ch=>m[ch]).join('، ');
}
function saraBookingMissingFields(){
  const a=saraBookingArgsFromState(), miss=[];
  if(!a.name)miss.push('الاسم'); if(!a.phone)miss.push('رقم الواتساب'); if(!a.party_size)miss.push('عدد الأشخاص'); if(!a.date)miss.push('التاريخ'); if(!a.time)miss.push('الوقت');
  return miss;
}
function saraBookingSummaryReply(){
  if(!saraBookingContextActive() || saraTableNumber || !saraCanConfirmBookingNow())return '';
  const a=saraBookingArgsFromState();
  const name=String(a.name||'').trim();
  const date=saraBookingDateDisplay(a.date);
  const time=saraBookingTimeDisplay(a.time);
  const party=Number(a.party_size)||0;
  const partyText=party===1?'لشخص واحد':party===2?'لشخصين':`لـ${party} أشخاص`;
  const phone=saraPhoneDisplay(a.phone);
  const orderText=Array.isArray(a.order_items)&&a.order_items.length?`ومع طلب مسبق: ${a.order_items.map(x=>`${Number(x.quantity)||1} ${x.item_name}${x.special_request?` (${x.special_request})`:''}`).join('، ')}`:'وبدون طلب مسبق';
  return `تمام ${name}، أتأكد معك قبل الاعتماد: رقم الجوال ${phone}، الحجز ${date} الساعة ${time} ${partyText}، ${orderText}. البيانات صحيحة وأعتمد الحجز؟`;
}
function saraLastAssistantAskedBookingField(){
  const last=[...conversationHistory].reverse().find(m=>m?.role==='assistant');
  const t=String(last?.content||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  return /(وش الاسم|الاسم اللي اسجل|رقم الجوال|رقم الواتساب|واتساب عشان|الحجز لكم شخص|اي يوم|أي يوم|الساعة كم|الوقت)/.test(t);
}
function saraBookingMissingReply(){
  if(!saraBookingContextActive() || saraTableNumber)return '';
  const miss=saraBookingMissingFields();
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
function saraPhoneReplyAfterCorrection(){
  const p=saraPhoneDisplay(saraBookingState.phone); if(!p)return '';
  const miss=saraBookingMissingFields();
  if(!miss.length)return `تمام، عدلت رقم الواتساب إلى ${p}. باقي بيانات حجزك محفوظة. أعتمد الحجز؟`;
  return `تمام، عدلت رقم الواتساب إلى ${p}. باقي بياناتك محفوظة، وباقي عندي ${miss[0]} فقط.`;
}
function saraNormalizeForEcho(text){
  return String(text||'').toLowerCase().replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').replace(/[^\u0600-\u06FF0-9a-z ]/gi,' ').replace(/\s+/g,' ').trim();
}
function saraLooksLikeSaraEcho(transcript){
  if(!saraCaptureStartedDuringSara || !saraLastSpokenText)return false;
  const q=saraNormalizeForEcho(transcript), a=saraNormalizeForEcho(saraLastSpokenText);
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
function saraDeterministicBookingReply(q){
  if(saraTableNumber || !saraBookingContextActive())return '';
  if(saraIsRepeatPhoneRequest(q) && saraBookingState.phone){
    return `رقم الواتساب المسجل عندي ${saraPhoneDisplay(saraBookingState.phone)}.`;
  }
  if(saraCanConfirmBookingNow() && saraLastAssistantAskedBookingField()){
    return saraBookingSummaryReply();
  }
  return saraBookingMissingReply();
}
function saraAssistantAsksKnownBookingField(answer){
  const t=String(answer||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[إأآ]/g,'ا').toLowerCase();
  if(saraBookingState.name && /(وش الاسم|ايش الاسم|اسم الحجز|الاسم اللي اسجل)/.test(t))return true;
  if(saraBookingState.phone && /(رقم الجوال|رقم الواتساب|عطيني رقم|وش رقم)/.test(t))return true;
  if(saraBookingState.partySize && /(?:الحجز|حجز).{0,20}(كم|لكم).{0,12}(شخص|اشخاص)|(?:كم|لكم).{0,12}(شخص|اشخاص)/.test(t))return true;
  if(saraBookingState.date && /(اي يوم|أي يوم|وش اليوم|تاريخ الحجز)/.test(t))return true;
  if(saraBookingState.time && /(الساعة كم|الساعه كم|وش الوقت|وقت الحجز)/.test(t))return true;
  return false;
}
function saraApplyBookingMemoryGuard(question,answer){
  const out=String(answer||'').trim();
  if(saraTableNumber || !saraBookingContextActive())return out;
  if(saraAssistantAsksKnownBookingField(out)){
    if(saraCanConfirmBookingNow())return saraBookingSummaryReply();
    return saraBookingMissingReply() || out;
  }
  return out;
}
async function saraAskWithBookingFallback(q){
  try{
    return await askSara(q);
  }catch(e){
    if(!saraTableNumber && saraBookingContextActive()){
      const fallback=saraDeterministicBookingReply(q) || (waiterLanguage==='ar'?'تمام، بيانات حجزك عندي. كمّل معي آخر معلومة ناقصة.':'Your booking details are still saved. Please continue with the remaining detail.');
      return {answer:fallback,localFallback:true};
    }
    throw e;
  }
}
async function processSaraVoice(blob,mime){
  saraVoiceProcessInFlight=true;
  saraBusy=true;
  try{
    status.textContent=TEXT[waiterLanguage].transcribing;
    const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';
    const form=new FormData(); form.append('audio',blob,'voice.'+ext); form.append('language',waiterLanguage);
    // Arabic accuracy fix: keep Cartesia for Sara's voice, but use OpenAI's
    // gpt-4o-transcribe for Saudi Arabic. Deepgram remains available for FR/EN.
    // This separation prevents the TTS engine choice from lowering STT accuracy.
    if(waiterLanguage!=='ar') form.append('mode','deepgram-stt');
    else form.append('mode','sara');
    const sttUrl='/api/transcribe';
    const r=await fetch(sttUrl,{method:'POST',body:form}); const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.text)throw new Error(d.message||'Transcription failed');
    let q=String(d.text).trim(); if(!q)return;
    q=normalizeSaraBookingApprovalTranscript(q);
    if(!saraTableNumber) q=saraNormalizePhoneTranscriptForDisplay(q);
    if(saraIsDuplicateTurn(q)){
      console.info('Sara: ignored duplicate voice turn',q);
      status.textContent=TEXT[waiterLanguage].ready;
      return;
    }
    if(saraLooksLikeSaraEcho(q)){
      console.info('Sara: ignored probable Sara echo',q);
      saraCaptureStartedDuringSara=false;
      saraBusy=false; status.textContent=TEXT[waiterLanguage].ready;
      return;
    }
    saraCaptureStartedDuringSara=false;
    const wasPhoneCorrection=!saraTableNumber && saraIsPhoneCorrection(q);
    if(!saraTableNumber)saraUpdateBookingState(q,'user');
    addBubble('user',q); conversationHistory.push({role:'user',content:q});
    status.textContent=isExplicitBookingConfirmation(q)&&waiterLanguage==='ar'?'تمام، أعتمد الحجز…':TEXT[waiterLanguage].thinking;
    let answer='';
    if(!saraTableNumber && saraAwaitingBookingApproval() && isExplicitBookingConfirmation(q) && saraCanConfirmBookingNow()){
      answer=await saraConfirmBookingDirectly();
    }else{
      const data=await saraAskWithBookingFallback(q);
      if(data.toolCall?.name==='confirm_table_order') answer=await handleSaraTableOrderTool(data.toolCall); else if(data.toolCall?.name==='confirm_booking_order') answer=await handleSaraBookingTool(data.toolCall); else if(data.toolCall?.name==='update_booking_preorder') answer=saraApplyPreorderTool(data.toolCall.arguments||data.toolCall.args||{}); else answer=String(data.answer||'').trim();
      if(!saraTableNumber)answer=saraApplyBookingMemoryGuard(q,answer);
    }
    if(!answer)throw new Error('No answer');
    if(!saraTableNumber)saraUpdateBookingState(answer,'assistant');
    addBubble('assistant',answer); conversationHistory.push({role:'assistant',content:answer}); status.textContent=TEXT[waiterLanguage].ready;
    await speakAI(answer);
  }catch(e){
    console.error('Sara voice error',e); status.textContent=e.message||TEXT[waiterLanguage].serverError; showDiagnostic(status.textContent,false);
  }finally{
    saraBusy=false;
    saraVoiceProcessInFlight=false;
  }
}

async function submitSaraQuestion(q){
  q=String(q||'').trim();if(!q||saraBusy||saraVoiceProcessInFlight)return;
  q=normalizeSaraBookingApprovalTranscript(q);
  if(!saraTableNumber) q=saraNormalizePhoneTranscriptForDisplay(q);
  if(saraIsDuplicateTurn(q)){console.info('Sara: ignored duplicate typed turn',q);return;}
  const wasPhoneCorrection=!saraTableNumber && saraIsPhoneCorrection(q);
  if(!saraTableNumber)saraUpdateBookingState(q,'user');
  stopSaraSpeechForBargeIn(); addBubble('user',q);conversationHistory.push({role:'user',content:q});input.value='';saraBusy=true;status.textContent=TEXT[waiterLanguage].thinking;
  try{
    let answer='';
    if(!saraTableNumber && saraAwaitingBookingApproval() && isExplicitBookingConfirmation(q) && saraCanConfirmBookingNow()){
      answer=await saraConfirmBookingDirectly();
    }else{
      const data=await saraAskWithBookingFallback(q);
      if(data.toolCall?.name==='confirm_table_order')answer=await handleSaraTableOrderTool(data.toolCall);else if(data.toolCall?.name==='confirm_booking_order')answer=await handleSaraBookingTool(data.toolCall);else if(data.toolCall?.name==='update_booking_preorder')answer=saraApplyPreorderTool(data.toolCall.arguments||data.toolCall.args||{});else answer=String(data.answer||'').trim();
      if(!saraTableNumber)answer=saraApplyBookingMemoryGuard(q,answer);
    }
    if(!answer)throw new Error('No answer'); if(!saraTableNumber)saraUpdateBookingState(answer,'assistant'); addBubble('assistant',answer);conversationHistory.push({role:'assistant',content:answer});status.textContent=TEXT[waiterLanguage].ready;await speakAI(answer);saraBusy=false;
  }catch(e){saraBusy=false;status.textContent=e.message||TEXT[waiterLanguage].serverError;showDiagnostic(status.textContent,false);}
}

async function startSara(){
  if(saraStarted)return;
  try{
    const supported=navigator.mediaDevices.getSupportedConstraints?.()||{};
    const constraints={echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1};
    // Avoid iOS voiceIsolation: it can clip the first syllable of quiet Arabic names.
    saraStream=await navigator.mediaDevices.getUserMedia({audio:constraints});
    const AC=window.AudioContext||window.webkitAudioContext;
    saraAudioContext=new AC();
    const src=saraAudioContext.createMediaStreamSource(saraStream);
    saraAnalyser=saraAudioContext.createAnalyser();
    saraAnalyser.fftSize=2048;
    // Faster envelope response for Deepgram so quiet/short Saudi utterances
    // trigger recording earlier instead of being swallowed by smoothing.
    saraAnalyser.smoothingTimeConstant=.22;
    src.connect(saraAnalyser);
    // Seed adaptive VAD conservatively; it continuously learns the ambient floor while idle.
    saraNoiseFloor=0.006; saraNoiseLastUpdate=0; saraVoiceCandidateAt=0; saraBargeCandidateAt=0;
    saraNoiseReadyAt=performance.now()+450;
    saraStarted=true; saraBusy=true;
    const engineReadyNote=waiterLanguage==='ar'?'🟢 سارة جاهزة':waiterLanguage==='fr'?'🟢 Sara prête':'🟢 Sara ready';
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
    saraBusy=false; runSaraVAD(); status.textContent=TEXT[waiterLanguage].ready;
  }catch(e){
    console.error('Sara start failed',e); closeSara(); status.textContent=e.message; showDiagnostic(e.message,false);
  }
}

function openWaiter(){
 currentDish=null; conversationHistory=[];
 waiterLanguage=siteLanguage||'ar'; permissionHelp.classList.remove('show');
 waiterLangStep.classList.remove('hidden'); chatStep.classList.add('hidden'); modal.classList.add('show');
}
cancelWaiter.onclick=closeWaiter;
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
 await startSara();
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
    saraLastSpokenText=clean;

    if(currentAudio){
      try{currentAudio.pause();}catch(e){}
      currentAudio=null;
    }
    if(typeof speechSource !== 'undefined' && speechSource){
      try{speechSource.stop();}catch(e){}
      speechSource=null;
    }

    const ttsEndpoint='/api/cartesia-tts';
    const speechText=waiterLanguage==='ar'?saraPrepareSpeechText(clean):clean;
    const r=await fetch(ttsEndpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:speechText,language:waiterLanguage})
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
        saraSpeaking=true;saraTtsStartedAt=performance.now();saraBargeCandidateAt=0;
        speechSource.onended=()=>{
          orb.classList.remove('speaking');
          speechSource=null;
          saraSpeaking=false;saraTtsEndedAt=performance.now();saraBargeCandidateAt=0;
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
    saraSpeaking=true;saraTtsStartedAt=performance.now();saraBargeCandidateAt=0;

    audio.onended=()=>{
      orb.classList.remove('speaking');
      URL.revokeObjectURL(url);
      if(currentAudio===audio) currentAudio=null;
      saraSpeaking=false;saraTtsEndedAt=performance.now();saraBargeCandidateAt=0;
    };
    audio.onerror=()=>{
      orb.classList.remove('speaking');
      saraSpeaking=false;saraTtsEndedAt=performance.now();saraBargeCandidateAt=0;
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
input.addEventListener('keydown',async e=>{
 if(e.key==='Enter'){
   stopAISpeech();
   await unlockSpeechAudio();
   submitSaraQuestion(input.value);
 }
});

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
 closeSara();
 if(currentAudio){currentAudio.pause();currentAudio=null;}
 modal.classList.remove('show'); currentDish=null; conversationHistory=[];
}
endBtn.onclick=closeWaiter;
