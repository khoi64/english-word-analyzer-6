const $ = s => document.querySelector(s);
const input = $("#wordInput"), result = $("#result"), statusEl = $("#status");
let current = null, quizState = null;
const historyKey = "leb_history_v2";
const wordHistory = JSON.parse(localStorage.getItem(historyKey) || "[]");

const fallbackForms = {
  achieve:{noun:"achievement", adjective:"achievable", adverb:"achievably"},
  describe:{noun:"description", adjective:"descriptive", adverb:"descriptively"},
  develop:{noun:"development", adjective:"developed/developing", adverb:"—"},
  improve:{noun:"improvement", adjective:"improved/improvable", adverb:"—"},
  decide:{noun:"decision", adjective:"decisive", adverb:"decisively"},
  confident:{noun:"confidence", adjective:"confident", adverb:"confidently"},
  independence:{noun:"independence", adjective:"independent", adverb:"independently"},
  progress:{noun:"progress", adjective:"progressive", adverb:"progressively"},
  success:{noun:"success", adjective:"successful", adverb:"successfully"},
  beauty:{noun:"beauty", adjective:"beautiful", adverb:"beautifully"},
  quick:{noun:"quickness", adjective:"quick", adverb:"quickly"},
  happy:{noun:"happiness", adjective:"happy", adverb:"happily"}
};

function setStatus(x=""){statusEl.textContent=x}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function uniq(a){return [...new Set(a.filter(Boolean).map(x=>x.trim()).filter(Boolean))]}

async function fetchJson(url){
  const r=await fetch(url); if(!r.ok) throw new Error("API error"); return r.json();
}
async function translate(text){
  try{
    const d=await fetchJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi`);
    return d?.responseData?.translatedText || "—";
  }catch{return "Không lấy được bản dịch lúc này";}
}
async function datamuse(word, rel){
  try{return await fetchJson(`https://api.datamuse.com/words?${rel}=${encodeURIComponent(word)}&max=12`)}catch{return []}
}

function guessForms(word, meanings){
  const lower=word.toLowerCase(), m=fallbackForms[lower] || {};
  let forms = [
    ["Noun",m.noun||"—"],["Verb",m.verb||"—"],["Adjective",m.adjective||"—"],["Adverb",m.adverb||"—"]
  ];
  if(!m.noun){
    if(/(tion|sion|ment|ness|ity|ance|ence|ship|er|or|al)$/.test(lower)) forms[0][1]=word;
    else if(/e$/.test(lower)) forms[0][1]=word.replace(/e$/,"ion");
    else forms[0][1]=word+"tion";
  }
  if(!m.verb){
    if(/^(un|re|de|en)/.test(lower)) forms[1][1]=word;
    else forms[1][1]=word.replace(/(ed|ing)$/,"");
  }
  if(!m.adjective && meanings.some(x=>x.partOfSpeech==="adjective")) forms[2][1]=word;
  if(!m.adverb){
    if(meanings.some(x=>x.partOfSpeech==="adverb")) forms[3][1]=word;
    else if(/y$/.test(lower)) forms[3][1]=word+"ly";
    else if(/(ful|ic|ive|al|ous|ent|ant)$/.test(lower)) forms[3][1]=word+"ly";
  }
  return forms;
}

async function searchWord(raw){
  const word=raw.trim().toLowerCase();
  if(!word) return;
  setStatus("Đang tra từ…");
  try{
    const data=await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    const entry=data[0];
    const meanings=entry.meanings||[];
    current={word:entry.word,phonetic:entry.phonetic||entry.phonetics?.find(x=>x.text)?.text||"",
      meanings, audio:entry.phonetics?.find(x=>x.audio)?.audio||""};
    $("#word").textContent=current.word;
    $("#phonetic").textContent="";
    const phonetics = (entry.phonetics||[]).filter(x=>x.text||x.audio);
    const audioItems = phonetics.filter(x=>x.audio);
    $("#pronunciation").innerHTML = `
      <div class="pron-row">
        <span class="ipa">${escapeHtml(current.phonetic || "Pronunciation available below")}</span>
        ${audioItems.length ? audioItems.slice(0,2).map((x,i)=>`
          <button class="pron-btn" data-audio="${escapeHtml(x.audio)}">🔊 ${i===0?"Listen":"Listen 2"}</button>
        `).join("") : `<button id="ttsBtn" class="pron-btn">🔊 Listen</button>`}
      </div>`;
    document.querySelectorAll(".pron-btn[data-audio]").forEach(b=>b.onclick=()=>{
      new Audio(b.dataset.audio).play();
    });
    $("#ttsBtn")?.addEventListener("click",()=>{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(current.word);
      u.lang="en-US"; u.rate=.82;
      speechSynthesis.speak(u);
    });
    $("#posChips").innerHTML=uniq(meanings.map(m=>m.partOfSpeech)).map(x=>`<span class="chip">${escapeHtml(x)}</span>`).join("");
    $("#translation").textContent=await translate(current.word);
    const forms=guessForms(current.word,meanings);
    $("#wordForms").innerHTML=`<div class="form-grid">${forms.map(([k,v])=>`<div class="form"><b>${k}</b><span>${escapeHtml(v)}</span></div>`).join("")}</div>`;
    $("#meanings").innerHTML=meanings.slice(0,8).map(m=>`<div class="meaning"><b>${escapeHtml(m.partOfSpeech)}</b><p>${escapeHtml(m.definitions?.[0]?.definition||"")}</p></div>`).join("");
    const syn=uniq([...(await datamuse(current.word,"rel_syn")).map(x=>x.word)]).slice(0,14);
    const ant=uniq([...(await datamuse(current.word,"rel_ant")).map(x=>x.word)]).slice(0,14);
    $("#synonyms").innerHTML=renderTags(syn); $("#antonyms").innerHTML=renderTags(ant);
    let ex=meanings.flatMap(m=>(m.definitions||[]).map(d=>d.example)).filter(Boolean);
    $("#examples").innerHTML=(ex.length?uniq(ex).slice(0,8):[`Example: I want to use "${current.word}" in a sentence.`]).map(x=>`<div class="example">${escapeHtml(x)}</div>`).join("");
    result.classList.remove("hidden"); setStatus("Đã tìm thấy từ.");
    if(!wordHistory.some(x=>x.word===current.word)){wordHistory.unshift({word:current.word,meanings});wordHistory.splice(20);localStorage.setItem(historyKey,JSON.stringify(wordHistory));}
    makeQuiz();
  }catch(e){
    console.error("Lookup error:", e);
    if(e.message==="API error") setStatus(`Không tìm thấy "${word}" trong từ điển. Kiểm tra chính tả hoặc thử từ khác.`);
    else setStatus("Có lỗi khi tra từ (mạng hoặc trình duyệt chặn request) — mở Console (F12) để xem chi tiết: "+e.message);
    result.classList.add("hidden");
  }
}
function renderTags(arr){return arr.length?arr.map(x=>`<span class="tag" data-word="${escapeHtml(x)}">${escapeHtml(x)}</span>`).join(""):`<span class="muted">Chưa có dữ liệu.</span>`}

async function makeQuiz(){
  if(wordHistory.length<2){$("#quizArea").innerHTML=`<p class="muted">Hãy tra ít nhất 2 từ để mở quiz 4 lựa chọn.</p>`;return}
  const target=wordHistory[Math.floor(Math.random()*wordHistory.length)];
  const def=target.meanings?.[0]?.definitions?.[0]?.definition||"";
  let others=wordHistory.filter(x=>x.word!==target.word).map(x=>x.word);
  while(others.length<3) others.push(["achieve","describe","progress","confident","develop"][Math.floor(Math.random()*5)]);
  others=uniq(others).filter(x=>x!==target.word).slice(0,3);
  const options=[target.word,...others].sort(()=>Math.random()-.5);
  quizState={answer:target.word};
  $("#quizArea").innerHTML=`<div class="quiz-question">Từ nào phù hợp với định nghĩa: <em>${escapeHtml(def)}</em>?</div>
    <div class="answers">${options.map(x=>`<button class="answer" data-answer="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join("")}</div>
    <div id="quizFeedback" class="quiz-feedback"></div>`;
  document.querySelectorAll(".answer").forEach(b=>b.onclick=()=>{
    document.querySelectorAll(".answer").forEach(x=>x.disabled=true);
    const ok=b.dataset.answer===quizState.answer;b.classList.add(ok?"correct":"wrong");
    $("#quizFeedback").textContent=ok?"✅ Chính xác!":"❌ Chưa đúng. Đáp án: "+quizState.answer;
  });
}
$("#searchBtn").onclick=()=>searchWord(input.value);
input.addEventListener("keydown",e=>{if(e.key==="Enter")searchWord(input.value)});
$("#newQuizBtn").onclick=makeQuiz;
const randomWords=["achieve","describe","progress","confident","independence","success","beauty","quick","happy","develop","improve","decide","curious","brave","gentle","fierce","ancient","modern","complex","simple","generous","honest","reliable","flexible","efficient","creative","stubborn","cautious","eager","grateful","journey","opportunity","challenge","solution","evidence","strategy","balance","habit","routine","goal","obstacle","benefit","impact","approach","perspective","wander","observe","imagine","hesitate","persuade","struggle","celebrate","criticize","admire","apologize","recommend","suddenly","carefully","eventually","obviously","gradually"];
$("#randomBtn").onclick=()=>{const w=randomWords[Math.floor(Math.random()*randomWords.length)];input.value=w;searchWord(w)};

document.addEventListener("click",e=>{const t=e.target.closest(".tag");if(t){input.value=t.dataset.word;searchWord(t.dataset.word)}});

if(wordHistory.length>=2) makeQuiz();
