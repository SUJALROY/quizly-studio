(() => {
"use strict";
const $=id=>document.getElementById(id), letters=["A","B","C","D"];
const S={bank:[],quiz:[],answers:[],index:0,left:0,totalSeconds:0,timer:null,startedAt:0,editIndex:null,confirmAction:null,toastTimer:null};
const DB_NAME="quizly-device-db", DB_VERSION=1, STORE="app";
let dbPromise=null, saveTimer=null;
function openLocalDB(){
 if(!("indexedDB" in window))return Promise.reject(new Error("IndexedDB unavailable"));
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("Could not open device storage"));
 });
 return dbPromise;
}
async function localGet(key){
 try{const db=await openLocalDB();return await new Promise((resolve,reject)=>{const r=db.transaction(STORE,"readonly").objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 catch(e){const raw=localStorage.getItem("quizly-"+key);return raw?JSON.parse(raw):undefined;}
}
async function localSet(key,value){
 try{const db=await openLocalDB();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
 catch(e){localStorage.setItem("quizly-"+key,JSON.stringify(value));}
}
function updateStorageStatus(message){const el=$("storageStatus");if(el)el.textContent=message;}
function saveDeviceData(){
 clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{
  try{
   await localSet("question-bank",S.bank);
   await localSet("settings",{title:$("quizTitle").value,duration:$("duration").value,questionLimit:$("questionLimit").value,shuffleQuestions:$("shuffleQuestions").value,shuffleOptions:$("shuffleOptions").value,negativeMarking:$("negativeMarking").checked,negativeValue:$("negativeValue").value});
   updateStorageStatus("All questions saved on this device");
  }catch(e){updateStorageStatus("Save failed — download a backup");}
 },150);
}
async function restoreDeviceData(){
 try{
  const saved=await localGet("question-bank");
  if(Array.isArray(saved)&&saved.length){S.bank=saved.filter(validQuestion);renderBank();status(`Restored ${S.bank.length} saved questions from this device.`,"success");}
  const settings=await localGet("settings");
  if(settings){["title","duration","questionLimit","shuffleQuestions","shuffleOptions","negativeValue"].forEach(k=>{const id=k==="title"?"quizTitle":k;if(settings[k]!==undefined)$(id).value=settings[k];});if(settings.negativeMarking!==undefined)$("negativeMarking").checked=!!settings.negativeMarking;}
  if(navigator.storage&&navigator.storage.persist){try{await navigator.storage.persist();}catch(_){}}
  updateStorageStatus(S.bank.length?`${S.bank.length} questions stored in this browser`:"Ready — questions will auto-save here");
 }catch(e){updateStorageStatus("Device storage unavailable — download a backup");}
}
function downloadBackup(){
 const data={app:"Quizly Studio",version:3,createdAt:new Date().toISOString(),title:$("quizTitle").value,questions:S.bank,settings:{duration:$("duration").value,questionLimit:$("questionLimit").value,shuffleQuestions:$("shuffleQuestions").value,shuffleOptions:$("shuffleOptions").value,negativeMarking:$("negativeMarking").checked,negativeValue:$("negativeValue").value}};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="quizly-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast("Backup downloaded to your device");
}
async function restoreBackupFile(file){
 if(!file)return;
 try{
  const data=JSON.parse(await file.text()),qs=Array.isArray(data)?data:data.questions;
  if(!Array.isArray(qs)||!qs.length)throw Error("This backup has no valid question list.");
  const valid=qs.filter(validQuestion);if(!valid.length)throw Error("No valid four-option questions found.");
  setBank(valid);if(data.title)$("quizTitle").value=data.title;
  if(data.settings){const s=data.settings;["duration","questionLimit","shuffleQuestions","shuffleOptions","negativeValue"].forEach(k=>{if(s[k]!==undefined)$(k).value=s[k];});if(s.negativeMarking!==undefined)$("negativeMarking").checked=!!s.negativeMarking;}
  saveDeviceData();status(`Restored ${valid.length} questions from backup.`,"success");toast("Backup restored successfully");
 }catch(e){toast(e.message||"Could not restore backup.");}
 $("backupInput").value="";
}

const V=["homeView","quizView","resultView"];
function view(id){V.forEach(x=>$(x).classList.toggle("hidden",x!==id));window.scrollTo({top:0,behavior:"smooth"});}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(S.toastTimer);S.toastTimer=setTimeout(()=>t.classList.remove("show"),2400);}
function status(msg,type=""){ $("importStatus").textContent=msg;$("importStatus").className="status "+type; }
function txt(x){return String(x??"").replace(/\u00a0/g," ").replace(/[ \t]+/g," ").trim();}
function parseQuestions(raw){
 const lines=String(raw||"").replace(/\r/g,"\n").split("\n").map(txt).filter(Boolean),out=[];
 let q=null,opt=null;
 const qre=/^(?:Q(?:UESTION)?\s*)?(\d{1,4})\s*[.)\-:]\s*(.+)$/i, ore=/^([A-D])\s*[.)\-:]\s*(.+)$/i, are=/^(?:(?:correct\s*)?answer|ans|key)\s*[:\-]\s*([A-D])\b/i;
 const flush=()=>{if(q&&q.question&&q.options.every(Boolean))out.push(q);q=null;opt=null;};
 for(const line of lines){
  const qm=line.match(qre),om=line.match(ore),am=line.match(are);
  if(qm){flush();q={question:txt(qm[2]),options:["","","",""],correct:null};continue;}
  if(!q)continue;
  if(am){q.correct=am[1].toUpperCase();opt=null;continue;}
  if(om){opt=letters.indexOf(om[1].toUpperCase());q.options[opt]=txt(om[2]);continue;}
  if(opt!==null)q.options[opt]+=" "+line;else q.question+=" "+line;
 }
 flush();return out;
}
async function extract(file){
 const ext=file.name.split(".").pop().toLowerCase();
 if(ext==="txt")return file.text();
 if(ext==="docx"){
  if(!window.mammoth)throw Error("Word reader did not load. Refresh with an internet connection.");
  const r=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return r.value;
 }
 if(ext==="pdf"){
  if(!window.pdfjsLib)throw Error("PDF reader did not load. Refresh with an internet connection.");
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,parts=[];
  for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),c=await p.getTextContent();parts.push(c.items.map(x=>x.str).join("\n"));}
  return parts.join("\n");
 }
 throw Error("Unsupported file type. Choose DOCX, PDF or TXT.");
}
function validQuestion(q){return q&&txt(q.question)&&Array.isArray(q.options)&&q.options.length===4&&q.options.every(x=>txt(x));}
function setBank(qs){S.bank=qs.filter(validQuestion).map(q=>({question:txt(q.question),options:q.options.map(txt),correct:letters.includes(q.correct)?q.correct:null}));renderBank();}
function renderBank(){
 saveDeviceData();
 const list=$("questionList");list.innerHTML="";
 $("bankCount").textContent=S.bank.length?`${S.bank.length} question${S.bank.length===1?"":"s"} ready · ${S.bank.filter(q=>q.correct).length} answer keys detected`:"Your imported questions will appear here.";
 $("startBtn").disabled=!S.bank.length;$("exportBtn").disabled=!S.bank.length;$("clearBtn").disabled=!S.bank.length;
 if(!S.bank.length){list.innerHTML='<div class="empty-state">Your question list is empty. Upload a file or add a question to get started.</div>';return;}
 S.bank.forEach((q,i)=>{
  const row=document.createElement("div");row.className="q-row";
  const num=document.createElement("span");num.className="q-index";num.textContent=String(i+1).padStart(2,"0");
  const copy=document.createElement("div");copy.className="q-copy";
  const title=document.createElement("strong");title.textContent=q.question;
  const sub=document.createElement("small");sub.textContent=`4 options · ${q.correct?`Answer key: ${q.correct}`:"No answer key"}`;
  copy.append(title,sub);
  const actions=document.createElement("div");actions.className="q-actions";
  const edit=document.createElement("button");edit.className="mini-btn";edit.textContent="Edit";edit.addEventListener("click",()=>openEditor(i));
  const del=document.createElement("button");del.className="mini-btn";del.textContent="×";del.title="Delete question";del.addEventListener("click",()=>{S.bank.splice(i,1);renderBank();toast("Question deleted");});
  actions.append(edit,del);row.append(num,copy,actions);list.append(row);
 });
}
function openEditor(index=null){
 S.editIndex=index;const q=index===null?{question:"",options:["","","",""],correct:""}:S.bank[index];
 $("editorHeading").textContent=index===null?"Add a question":"Edit question";
 $("editQuestion").value=q.question;
 $("editorOptions").innerHTML="";
 q.options.forEach((v,i)=>{const row=document.createElement("label");row.className="editor-option";const b=document.createElement("b");b.textContent=letters[i];const input=document.createElement("input");input.className="input";input.id="editOption"+i;input.value=v;input.placeholder=`Option ${letters[i]}`;row.append(b,input);$("editorOptions").append(row);});
 $("editCorrect").value=q.correct||"";$("deleteQuestion").classList.toggle("hidden",index===null);
 $("editorModal").classList.remove("hidden");
}
function closeModal(id){$(id).classList.add("hidden");}
function saveEditor(){
 const q={question:txt($("editQuestion").value),options:letters.map((_,i)=>txt($("editOption"+i).value)),correct:$("editCorrect").value||null};
 if(!validQuestion(q)){toast("Please fill in the question and all four options.");return;}
 if(S.editIndex===null)S.bank.push(q);else S.bank[S.editIndex]=q;
 closeModal("editorModal");renderBank();toast("Question saved");
}
function sample(){
 setBank([
 {question:"Who is known as the Father of the Indian Constitution?",options:["Mahatma Gandhi","Dr. B. R. Ambedkar","Jawaharlal Nehru","Dr. Rajendra Prasad"],correct:"B"},
 {question:"What is the capital of India?",options:["Patna","Mumbai","New Delhi","Kolkata"],correct:"C"},
 {question:"Which planet is known as the Red Planet?",options:["Venus","Mars","Jupiter","Mercury"],correct:"B"},
 {question:"Who discovered the sea route to India in 1498?",options:["Christopher Columbus","Vasco da Gama","Ferdinand Magellan","James Cook"],correct:"B"},
 {question:"Which is the largest ocean on Earth?",options:["Atlantic Ocean","Indian Ocean","Arctic Ocean","Pacific Ocean"],correct:"D"}
 ]);$("quizTitle").value="General Knowledge Practice";status("Sample question set loaded. Review or edit the questions below.","success");
}
function shuffle(a){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;}
function start(){
 let qs=[...S.bank];const limit=Math.max(0,Math.min(qs.length,Number($("questionLimit").value)||0));if(limit)qs=qs.slice(0,limit);
 if($("shuffleQuestions").value==="yes")qs=shuffle(qs);
 if($("shuffleOptions").value==="yes")qs=qs.map(q=>{const opts=shuffle(q.options.map((label,i)=>({label,old:letters[i]})));return{...q,options:opts.map(o=>o.label),correct:q.correct?letters[opts.findIndex(o=>o.old===q.correct)]:null};});
 S.quiz=qs;S.answers=Array(qs.length).fill(null);S.index=0;S.totalSeconds=Math.max(1,Math.min(300,Number($("duration").value)||30))*60;S.left=S.totalSeconds;S.startedAt=Date.now();
 $("activeTitle").textContent=txt($("quizTitle").value)||"Practice Quiz";view("quizView");renderQuestion();tick();clearInterval(S.timer);S.timer=setInterval(()=>{S.left--;tick();if(S.left<=0)finish(true);},1000);
}
function timeFmt(n){return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;}
function tick(){$("timer").textContent=timeFmt(Math.max(0,S.left));$("timerCard").classList.toggle("warning",S.left<=60);}
function renderQuestion(){
 const q=S.quiz[S.index];$("questionNo").textContent=`QUESTION ${String(S.index+1).padStart(2,"0")}`;$("questionText").textContent=q.question;$("options").innerHTML="";
 q.options.forEach((v,i)=>{const l=document.createElement("label");l.className="option"+(S.answers[S.index]===letters[i]?" selected":"");const inp=document.createElement("input");inp.type="radio";inp.name="choice";inp.checked=S.answers[S.index]===letters[i];inp.addEventListener("change",()=>{S.answers[S.index]=letters[i];renderQuestion();});const key=document.createElement("span");key.className="option-letter";key.textContent=letters[i];const val=document.createElement("span");val.className="option-text";val.textContent=v;l.append(inp,key,val);$("options").append(l);});
 $("prevBtn").disabled=S.index===0;$("prevBtn").style.opacity=S.index===0?".4":"1";$("nextBtn").textContent=S.index===S.quiz.length-1?"Review & finish →":"Next question →";renderProgress();
}
function renderProgress(){
 const done=S.answers.filter(Boolean).length,total=S.quiz.length;$("progressText").textContent=`Question ${S.index+1} of ${total}`;$("answeredText").textContent=`${done} answered`;$("progressBar").style.width=`${(S.index+1)/total*100}%`;$("questionNav").innerHTML="";
 S.quiz.forEach((_,i)=>{const b=document.createElement("button");b.className="nav-number"+(i===S.index?" current":"")+(S.answers[i]?" done":"");b.textContent=i+1;b.addEventListener("click",()=>{S.index=i;renderQuestion();});$("questionNav").append(b);});
}
function askConfirm(message,action){$("confirmMessage").textContent=message;S.confirmAction=action;$("confirmModal").classList.remove("hidden");}
function finish(timeUp=false){
 clearInterval(S.timer);S.timer=null;let correct=0,wrong=0,skip=0,score=0;const negative=$("negativeMarking").checked?Math.max(0,Number($("negativeValue").value)||0):0;
 S.quiz.forEach((q,i)=>{if(!S.answers[i])skip++;else if(q.correct&&S.answers[i]===q.correct){correct++;score+=1;}else{wrong++;if(q.correct&&negative)score-=negative;}});
 const percent=Math.max(0,Math.round(correct/S.quiz.length*100));const elapsed=Math.max(0,S.totalSeconds-S.left);
 $("resultHeading").textContent=timeUp?"Time is up!":"Practice completed";$("resultMessage").textContent=timeUp?"Your time ended. Your answers were submitted automatically.":"Your practice summary is ready.";
 const max=S.quiz.length;const shown=Number.isInteger(score)?score:String(Number(score.toFixed(2)));$("scoreValue").textContent=`${shown} / ${max}`;$("percentValue").textContent=`${percent}% accuracy · ${correct} correct out of ${max}`;
 $("correctValue").textContent=correct;$("wrongValue").textContent=wrong;$("skipValue").textContent=skip;$("timeUsed").textContent=timeFmt(elapsed);view("resultView");
}
async function handleFile(file){
 if(!file)return;status(`Reading ${file.name}…`);
 try{const raw=await extract(file);const qs=parseQuestions(raw);if(!qs.length)throw Error("No complete questions detected. Check the sample format and ensure your PDF has selectable text.");const before=S.bank.length;setBank([...S.bank,...qs]);status(`${qs.length} questions imported from ${file.name}. ${S.bank.length-before} added to your question bank.`,"success");toast(`${qs.length} questions imported`);}
 catch(e){status(e.message||"Could not read this file.","error");}
 $("fileInput").value="";
}
function exportJson(){
 const blob=new Blob([JSON.stringify({title:$("quizTitle").value,questions:S.bank},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="quizly-questions.json";a.click();URL.revokeObjectURL(url);toast("Question bank exported");
}
function toggleTheme(){document.body.classList.toggle("dark");localStorage.setItem("quizly-theme",document.body.classList.contains("dark")?"dark":"light");}
function init(){
 if(localStorage.getItem("quizly-theme")==="dark")document.body.classList.add("dark");
 $("fileInput").addEventListener("change",e=>handleFile(e.target.files[0]));$("sampleBtn").addEventListener("click",sample);$("addQuestionBtn").addEventListener("click",()=>openEditor());
 $("saveQuestion").addEventListener("click",saveEditor);$("deleteQuestion").addEventListener("click",()=>{if(S.editIndex!==null){S.bank.splice(S.editIndex,1);renderBank();closeModal("editorModal");toast("Question deleted");}});
 document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));
 $("startBtn").addEventListener("click",start);$("prevBtn").addEventListener("click",()=>{if(S.index>0){S.index--;renderQuestion();}});
 $("nextBtn").addEventListener("click",()=>{if(S.index<S.quiz.length-1){S.index++;renderQuestion();}else askConfirm(`${S.answers.filter(Boolean).length} of ${S.quiz.length} answered. Submit and view your score?`,()=>finish(false));});
 $("submitBtn").addEventListener("click",()=>askConfirm(`${S.answers.filter(Boolean).length} of ${S.quiz.length} answered. Submit your practice now?`,()=>finish(false)));
 $("keepBtn").addEventListener("click",()=>closeModal("confirmModal"));$("confirmBtn").addEventListener("click",()=>{closeModal("confirmModal");if(S.confirmAction)S.confirmAction();S.confirmAction=null;});
 $("exitBtn").addEventListener("click",()=>askConfirm("Exit this practice? Your current answers will be lost.",()=>{clearInterval(S.timer);S.timer=null;view("homeView");}));
 $("retryBtn").addEventListener("click",start);$("homeBtn").addEventListener("click",()=>view("homeView"));
 $("clearBtn").addEventListener("click",()=>askConfirm("Delete all questions from this question bank?",()=>{S.bank=[];renderBank();status("Question bank cleared.");}));
 $("exportBtn").addEventListener("click",exportJson);$("backupBtn").addEventListener("click",downloadBackup);$("restoreBtn").addEventListener("click",()=>$("backupInput").click());$("backupInput").addEventListener("change",e=>restoreBackupFile(e.target.files[0]));$("themeBtn").addEventListener("click",toggleTheme);
 const dz=$("dropzone");["dragenter","dragover"].forEach(e=>dz.addEventListener(e,x=>{x.preventDefault();dz.classList.add("dragover");}));["dragleave","drop"].forEach(e=>dz.addEventListener(e,x=>{x.preventDefault();dz.classList.remove("dragover");}));dz.addEventListener("drop",e=>handleFile(e.dataTransfer.files[0]));
 renderBank();
  ["quizTitle","duration","questionLimit","shuffleQuestions","shuffleOptions","negativeMarking","negativeValue"].forEach(id=>$(id).addEventListener("change",saveDeviceData));
  restoreDeviceData();
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
init();
})();