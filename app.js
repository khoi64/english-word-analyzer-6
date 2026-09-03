const $ = s => document.querySelector(s);

const input = $("#wordInput");
const result = $("#result");
const statusEl = $("#status");
const searchBtn = $("#searchBtn");

let current = null;
let quizState = null;
let searchToken = 0;


// ======================================================
// CACHE + HISTORY
// ======================================================

const historyKey = "leb_history_v2";
const cacheKey = "leb_cache_v2";

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 ngày
const CACHE_MAX_ENTRIES = 80;


let wordHistory = [];

try {
  wordHistory = JSON.parse(localStorage.getItem(historyKey) || "[]");

  if (!Array.isArray(wordHistory)) {
    wordHistory = [];
  }
} catch {
  wordHistory = [];
}


let wordCache = {};

try {
  wordCache = JSON.parse(localStorage.getItem(cacheKey) || "{}");

  if (!wordCache || typeof wordCache !== "object") {
    wordCache = {};
  }
} catch {
  wordCache = {};
}


// ======================================================
// FALLBACK WORD FORMS
// ======================================================

const fallbackForms = {

  achieve: {
    noun: "achievement",
    adjective: "achievable",
    adverb: "achievably"
  },

  describe: {
    noun: "description",
    adjective: "descriptive",
    adverb: "descriptively"
  },

  develop: {
    noun: "development",
    adjective: "developed/developing",
    adverb: "—"
  },

  improve: {
    noun: "improvement",
    adjective: "improved/improvable",
    adverb: "—"
  },

  decide: {
    noun: "decision",
    adjective: "decisive",
    adverb: "decisively"
  },

  confident: {
    noun: "confidence",
    adjective: "confident",
    adverb: "confidently"
  },

  independence: {
    noun: "independence",
    adjective: "independent",
    adverb: "independently"
  },

  progress: {
    noun: "progress",
    adjective: "progressive",
    adverb: "progressively"
  },

  success: {
    noun: "success",
    adjective: "successful",
    adverb: "successfully"
  },

  beauty: {
    noun: "beauty",
    adjective: "beautiful",
    adverb: "beautifully"
  },

  quick: {
    noun: "quickness",
    adjective: "quick",
    adverb: "quickly"
  },

  happy: {
    noun: "happiness",
    adjective: "happy",
    adverb: "happily"
  }

};


// ======================================================
// BASIC FUNCTIONS
// ======================================================

function setStatus(text = "") {
  statusEl.textContent = text;
}


function escapeHtml(s = "") {

  return String(s).replace(
    /[&<>"']/g,

    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );

}


function uniq(arr) {

  return [
    ...new Set(
      arr
        .filter(Boolean)
        .map(x => String(x).trim())
        .filter(Boolean)
    )
  ];

}


// ======================================================
// SAVE CACHE
// ======================================================

function saveCache() {

  try {

    const entries = Object.entries(wordCache);

    if (entries.length > CACHE_MAX_ENTRIES) {

      entries.sort(
        (a, b) => (a[1]?.time || 0) - (b[1]?.time || 0)
      );

      entries
        .slice(0, entries.length - CACHE_MAX_ENTRIES)
        .forEach(([key]) => {
          delete wordCache[key];
        });

    }

    localStorage.setItem(
      cacheKey,
      JSON.stringify(wordCache)
    );

  } catch (e) {

    console.warn(
      "Không thể lưu cache:",
      e
    );

  }

}


// ======================================================
// FETCH API AN TOÀN
// TIMEOUT + RETRY
// ======================================================

async function fetchJson(
  url,
  timeoutMs = 12000,
  retries = 1
) {

  let lastError = null;

  for (
    let attempt = 0;
    attempt <= retries;
    attempt++
  ) {

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    try {

      const response = await fetch(
        url,
        {
          signal: controller.signal,
          cache: "no-store"
        }
      );

      if (!response.ok) {

        throw new Error(
          `HTTP ${response.status}`
        );

      }

      return await response.json();

    } catch (error) {

      lastError = error;

      console.warn(
        `API attempt ${attempt + 1} failed:`,
        error
      );

      if (attempt < retries) {

        await new Promise(
          resolve => setTimeout(resolve, 500)
        );

      }

    } finally {

      clearTimeout(timer);

    }

  }

  throw lastError || new Error("Unknown API error");

}


// ======================================================
// TRANSLATION
// MyMemory API
// ======================================================

async function translate(text) {

  try {

    const url =
      `https://api.mymemory.translated.net/get` +
      `?q=${encodeURIComponent(text)}` +
      `&langpair=en|vi`;

    const data = await fetchJson(
      url,
      6000,
      0
    );

    return (
      data?.responseData?.translatedText ||
      "—"
    );

  } catch (error) {

    console.warn(
      "Translation error:",
      error
    );

    return "Chưa có bản dịch";

  }

}


// ======================================================
// DATAMUSE
// SYNONYMS / ANTONYMS
// ======================================================

async function datamuse(word, relation) {

  try {

    const url =
      `https://api.datamuse.com/words` +
      `?${relation}=${encodeURIComponent(word)}` +
      `&max=12`;

    const data = await fetchJson(
      url,
      5000,
      0
    );

    return Array.isArray(data)
      ? data
      : [];

  } catch (error) {

    console.warn(
      "Datamuse error:",
      error
    );

    return [];

  }

}


// ======================================================
// GUESS WORD FORMS
// ======================================================

function guessForms(word, meanings) {

  const lower = word.toLowerCase();

  const fallback =
    fallbackForms[lower] || {};

  let forms = [

    [
      "Noun",
      fallback.noun || "—"
    ],

    [
      "Verb",
      fallback.verb || "—"
    ],

    [
      "Adjective",
      fallback.adjective || "—"
    ],

    [
      "Adverb",
      fallback.adverb || "—"
    ]

  ];


  // --------------------------
  // Noun
  // --------------------------

  if (!fallback.noun) {

    if (
      /(tion|sion|ment|ness|ity|ance|ence|ship|er|or|al)$/
        .test(lower)
    ) {

      forms[0][1] = word;

    } else if (/e$/.test(lower)) {

      forms[0][1] =
        word.replace(/e$/, "ion");

    } else {

      forms[0][1] =
        word + "tion";

    }

  }


  // --------------------------
  // Verb
  // --------------------------

  if (!fallback.verb) {

    if (
      /^(un|re|de|en)/.test(lower)
    ) {

      forms[1][1] = word;

    } else {

      forms[1][1] =
        word.replace(/(ed|ing)$/, "");

    }

  }


  // --------------------------
  // Adjective
  // --------------------------

  if (
    !fallback.adjective &&
    meanings.some(
      x => x.partOfSpeech === "adjective"
    )
  ) {

    forms[2][1] = word;

  }


  // --------------------------
  // Adverb
  // --------------------------

  if (!fallback.adverb) {

    if (
      meanings.some(
        x => x.partOfSpeech === "adverb"
      )
    ) {

      forms[3][1] = word;

    } else if (/y$/.test(lower)) {

      forms[3][1] =
        word + "ly";

    } else if (
      /(ful|ic|ive|al|ous|ent|ant)$/.test(lower)
    ) {

      forms[3][1] =
        word + "ly";

    }

  }


  return forms;

}


// ======================================================
// PRONUNCIATION
// ======================================================

function accentLabel(url = "") {

  if (
    /-uk\.mp3(\?|$)/i.test(url)
  ) {

    return "UK";

  }

  if (
    /-us\.mp3(\?|$)/i.test(url)
  ) {

    return "US";

  }

  return "";

}


function dedupeByAudio(arr) {

  const seen = new Set();

  const output = [];

  for (const item of arr) {

    if (
      item.audio &&
      !seen.has(item.audio)
    ) {

      seen.add(item.audio);

      output.push(item);

    }

  }

  return output;

}


function renderPronunciation(
  entry,
  word
) {

  const phonetics =
    (entry.phonetics || [])
      .filter(
        x => x.text || x.audio
      );


  const ipaTexts = uniq(
    phonetics.map(
      x => x.text
    )
  );


  const mainPhonetic =
    entry.phonetic ||
    ipaTexts[0] ||
    "";


  const ipaLine =
    ipaTexts.length
      ? ipaTexts.join("  •  ")
      : "Chưa có phiên âm";


  $("#phonetic").textContent =
    mainPhonetic;


  // --------------------------
  // Audio buttons
  // --------------------------

  const audioItems =
    dedupeByAudio(
      phonetics.filter(
        x => x.audio
      )
    ).slice(0, 2);


  const buttonsHtml =
    audioItems.length

      ? audioItems
          .map((item, index) => {

            const label =
              accentLabel(item.audio) ||
              (
                index === 0
                  ? "Listen"
                  : "Listen 2"
              );

            return `
              <button
                class="pron-btn"
                data-audio="${escapeHtml(item.audio)}"
              >
                🔊 ${label}
              </button>
            `;

          })
          .join("")

      : `
          <button
            id="ttsBtn"
            class="pron-btn"
          >
            🔊 Listen
          </button>
        `;


  $("#pronunciation").innerHTML = `
    <div class="pron-row">

      <span class="ipa">
        ${escapeHtml(ipaLine)}
      </span>

      ${buttonsHtml}

    </div>
  `;


  // --------------------------
  // Dictionary audio
  // --------------------------

  document
    .querySelectorAll(
      ".pron-btn[data-audio]"
    )
    .forEach(button => {

      button.onclick = () => {

        const audio =
          new Audio(
            button.dataset.audio
          );

        audio.play().catch(
          () => {}
        );

      };

    });


  // --------------------------
  // Browser TTS
  // --------------------------

  $("#ttsBtn")?.addEventListener(
    "click",
    () => {

      if (
        !("speechSynthesis" in window)
      ) {

        return;

      }

      speechSynthesis.cancel();

      const utterance =
        new SpeechSynthesisUtterance(
          word
        );

      utterance.lang = "en-US";
      utterance.rate = 0.82;

      speechSynthesis.speak(
        utterance
      );

    }
  );

}


// ======================================================
// TAGS
// ======================================================

function renderTags(arr) {

  if (!arr.length) {

    return `
      <span class="muted">
        Chưa có dữ liệu.
      </span>
    `;

  }


  return arr
    .map(
      word => `
        <span
          class="tag"
          data-word="${escapeHtml(word)}"
        >
          ${escapeHtml(word)}
        </span>
      `
    )
    .join("");

}


// ======================================================
// RENDER WORD
// ======================================================

function renderEntry(
  entry,
  myToken,
  extras = {}
) {

  const meanings =
    entry.meanings || [];


  current = {

    word:
      entry.word,

    phonetic:
      entry.phonetic ||
      entry.phonetics?.find(
        x => x.text
      )?.text ||
      "",

    meanings,

    audio:
      entry.phonetics?.find(
        x => x.audio
      )?.audio ||
      ""

  };


  // ====================================================
  // WORD TITLE
  // ====================================================

  $("#word").textContent =
    current.word;


  renderPronunciation(
    entry,
    current.word
  );


  // ====================================================
  // PART OF SPEECH
  // ====================================================

  const partsOfSpeech =
    uniq(
      meanings.map(
        m => m.partOfSpeech
      )
    );


  $("#posChips").innerHTML =
    partsOfSpeech
      .map(
        x => `
          <span class="chip">
            ${escapeHtml(x)}
          </span>
        `
      )
      .join("");


  // ====================================================
  // WORD FORMS
  // ====================================================

  const forms =
    guessForms(
      current.word,
      meanings
    );


  $("#wordForms").innerHTML = `
    <div class="form-grid">

      ${forms
        .map(
          ([type, value]) => `
            <div class="form">

              <b>
                ${escapeHtml(type)}
              </b>

              <span>
                ${escapeHtml(value)}
              </span>

            </div>
          `
        )
        .join("")}

    </div>
  `;


  // ====================================================
  // MEANINGS
  // ====================================================

  $("#meanings").innerHTML =
    meanings
      .slice(0, 8)
      .map(
        meaning => `
          <div class="meaning">

            <b>
              ${escapeHtml(
                meaning.partOfSpeech || ""
              )}
            </b>

            <p>
              ${escapeHtml(
                meaning
                  .definitions?.[0]
                  ?.definition ||
                ""
              )}
            </p>

          </div>
        `
      )
      .join("");


  // ====================================================
  // EXAMPLES
  // ====================================================

  const examples =
    meanings
      .flatMap(
        meaning =>
          (meaning.definitions || [])
            .map(
              definition =>
                definition.example
            )
      )
      .filter(Boolean);


  $("#examples").innerHTML = (

    examples.length

      ? uniq(examples).slice(0, 8)

      : [
          `Example: I want to use "${current.word}" in a sentence.`
        ]

  )
    .map(
      example => `
        <div class="example">
          ${escapeHtml(example)}
        </div>
      `
    )
    .join("");


  // ====================================================
  // SHOW RESULT IMMEDIATELY
  // ====================================================

  result.classList.remove(
    "hidden"
  );


  // ====================================================
  // SAVE HISTORY
  // ====================================================

  if (
    !wordHistory.some(
      x => x.word === current.word
    )
  ) {

    wordHistory.unshift({

      word:
        current.word,

      meanings

    });


    wordHistory.splice(20);


    try {

      localStorage.setItem(
        historyKey,
        JSON.stringify(wordHistory)
      );

    } catch {

      // Ignore storage error

    }

  }


  // ====================================================
  // QUIZ
  // ====================================================

  makeQuiz();


  // ====================================================
  // TRANSLATION
  // KHÔNG CHẶN KẾT QUẢ CHÍNH
  // ====================================================

  if (extras.translation) {

    $("#translation").textContent =
      extras.translation;

  } else {

    $("#translation").textContent =
      "Đang dịch…";


    translate(
      current.word
    ).then(
      translation => {

        if (
          myToken !== searchToken
        ) {

          return;

        }


        $("#translation")
          .textContent =
          translation;


        const cache =
          wordCache[
            current.word
          ];


        if (cache) {

          cache.translation =
            translation;

          saveCache();

        }

      }
    );

  }


  // ====================================================
  // SYNONYMS + ANTONYMS
  // ====================================================

  if (
    Array.isArray(extras.syn) &&
    Array.isArray(extras.ant)
  ) {

    $("#synonyms").innerHTML =
      renderTags(extras.syn);

    $("#antonyms").innerHTML =
      renderTags(extras.ant);

  } else {

    $("#synonyms").innerHTML = `
      <span class="muted">
        Đang tải…
      </span>
    `;


    $("#antonyms").innerHTML = `
      <span class="muted">
        Đang tải…
      </span>
    `;


    // Chạy song song
    Promise.all([
      datamuse(
        current.word,
        "rel_syn"
      ),

      datamuse(
        current.word,
        "rel_ant"
      )

    ])
      .then(
        ([synResult, antResult]) => {

          if (
            myToken !== searchToken
          ) {

            return;

          }


          const synonyms =
            uniq(
              synResult.map(
                x => x.word
              )
            ).slice(0, 14);


          const antonyms =
            uniq(
              antResult.map(
                x => x.word
              )
            ).slice(0, 14);


          $("#synonyms").innerHTML =
            renderTags(synonyms);


          $("#antonyms").innerHTML =
            renderTags(antonyms);


          const cache =
            wordCache[
              current.word
            ];


          if (cache) {

            cache.syn =
              synonyms;

            cache.ant =
              antonyms;

            saveCache();

          }

        }
      )
      .catch(
        () => {

          $("#synonyms").innerHTML =
            `
              <span class="muted">
                Chưa có dữ liệu.
              </span>
            `;


          $("#antonyms").innerHTML =
            `
              <span class="muted">
                Chưa có dữ liệu.
              </span>
            `;

        }
      );

  }

}


// ======================================================
// SEARCH WORD
// ======================================================

async function searchWord(raw) {

  const word =
    raw
      .trim()
      .toLowerCase();


  // Không nhập gì
  if (!word) {

    setStatus(
      "Hãy nhập một từ tiếng Anh."
    );

    return;

  }


  // Token mới
  const myToken =
    ++searchToken;


  searchBtn.disabled =
    true;


  setStatus(
    `Đang tra "${word}"…`
  );


  // ====================================================
  // CACHE
  // ====================================================

  const cached =
    wordCache[word];


  if (
    cached &&
    cached.entry &&
    (
      Date.now() -
      cached.time <
      CACHE_TTL
    )
  ) {

    renderEntry(
      cached.entry,
      myToken,
      {
        translation:
          cached.translation,

        syn:
          cached.syn,

        ant:
          cached.ant
      }
    );


    setStatus(
      "Đã tìm thấy từ trong bộ nhớ đệm ⚡"
    );


    searchBtn.disabled =
      false;


    return;

  }


  // ====================================================
  // DICTIONARY API
  // ====================================================

  try {

    const url =
      `https://api.dictionaryapi.dev/api/v2/entries/en/` +
      `${encodeURIComponent(word)}`;


    /*
      Timeout 12 giây
      Retry 1 lần
    */

    const data =
      await fetchJson(
        url,
        12000,
        1
      );


    // Người dùng đã tra từ khác
    if (
      myToken !== searchToken
    ) {

      return;

    }


    if (
      !Array.isArray(data) ||
      !data.length
    ) {

      throw new Error(
        "EMPTY_RESULT"
      );

    }


    const entry =
      data[0];


    // ==================================================
    // SAVE CACHE
    // ==================================================

    wordCache[word] = {

      time:
        Date.now(),

      entry,

      translation:
        null,

      syn:
        null,

      ant:
        null

    };


    saveCache();


    // ==================================================
    // HIỂN THỊ KẾT QUẢ NGAY
    // ==================================================

    renderEntry(
      entry,
      myToken
    );


    setStatus(
      "Đã tìm thấy từ ✓"
    );


  } catch (error) {

    if (
      myToken !== searchToken
    ) {

      return;

    }


    console.error(
      "Lookup error:",
      error
    );


    // ==================================================
    // KHÔNG TÌM THẤY
    // ==================================================

    if (
      error.message ===
      "EMPTY_RESULT"
    ) {

      setStatus(
        `Không tìm thấy "${word}". ` +
        `Kiểm tra chính tả hoặc thử từ khác.`
      );

    }


    // ==================================================
    // TIMEOUT
    // ==================================================

    else if (
      error.name ===
      "AbortError"
    ) {

      setStatus(
        "API phản hồi quá chậm. " +
        "Kiểm tra mạng rồi thử lại nhé."
      );

    }


    // ==================================================
    // HTTP ERROR
    // ==================================================

    else if (
      error.message?.startsWith(
        "HTTP"
      )
    ) {

      setStatus(
        `Từ điển đang gặp lỗi (${error.message}). ` +
        `Thử lại sau nhé.`
      );

    }


    // ==================================================
    // NETWORK ERROR
    // ==================================================

    else {

      setStatus(
        "Không thể kết nối tới từ điển. " +
        "Kiểm tra mạng rồi thử lại."
      );

    }


    result.classList.add(
      "hidden"
    );


  } finally {

    if (
      myToken === searchToken
    ) {

      searchBtn.disabled =
        false;

    }

  }

}


// ======================================================
// QUIZ
// ======================================================

function makeQuiz() {

  if (
    wordHistory.length < 2
  ) {

    $("#quizArea").innerHTML = `
      <p class="muted">
        Hãy tra ít nhất 2 từ để mở quiz 4 lựa chọn.
      </p>
    `;

    return;

  }


  // Random từ đã tra
  const target =
    wordHistory[
      Math.floor(
        Math.random() *
        wordHistory.length
      )
    ];


  const definition =
    target
      .meanings?.[0]
      ?.definitions?.[0]
      ?.definition ||
    "";


  // Các đáp án khác
  let others =
    wordHistory
      .filter(
        x => x.word !== target.word
      )
      .map(
        x => x.word
      );


  // Nếu chưa đủ 3 đáp án
  const fallbackQuizWords = [
    "achieve",
    "describe",
    "progress",
    "confident",
    "develop",
    "improve",
    "success",
    "challenge"
  ];


  while (
    others.length < 3
  ) {

    const randomWord =
      fallbackQuizWords[
        Math.floor(
          Math.random() *
          fallbackQuizWords.length
        )
      ];


    if (
      randomWord !== target.word &&
      !others.includes(randomWord)
    ) {

      others.push(
        randomWord
      );

    }

  }


  others =
    uniq(others)
      .filter(
        x => x !== target.word
      )
      .slice(0, 3);


  // Tạo đáp án
  const options =
    [
      target.word,
      ...others
    ].sort(
      () => Math.random() - 0.5
    );


  quizState = {
    answer:
      target.word
  };


  $("#quizArea").innerHTML = `

    <div class="quiz-question">

      Từ nào phù hợp với định nghĩa:

      <em>
        ${escapeHtml(definition)}
      </em>?

    </div>


    <div class="answers">

      ${options
        .map(
          word => `
            <button
              class="answer"
              data-answer="${escapeHtml(word)}"
            >
              ${escapeHtml(word)}
            </button>
          `
        )
        .join("")}

    </div>


    <div
      id="quizFeedback"
      class="quiz-feedback"
    ></div>

  `;


  // Xử lý click
  document
    .querySelectorAll(
      ".answer"
    )
    .forEach(button => {

      button.onclick = () => {

        // Không cho bấm nhiều lần
        document
          .querySelectorAll(
            ".answer"
          )
          .forEach(
            x => {
              x.disabled = true;
            }
          );


        const correct =
          button.dataset.answer ===
          quizState.answer;


        button.classList.add(
          correct
            ? "correct"
            : "wrong"
        );


        $("#quizFeedback")
          .textContent = correct

            ? "✅ Chính xác!"

            : "❌ Chưa đúng. Đáp án: " +
              quizState.answer;

      };

    });

}


// ======================================================
// SEARCH BUTTON
// ======================================================

searchBtn.onclick = () => {

  searchWord(
    input.value
  );

};


// ======================================================
// ENTER KEY
// ======================================================

input.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Enter"
    ) {

      searchWord(
        input.value
      );

    }

  }
);


// ======================================================
// NEW QUIZ
// ======================================================

$("#newQuizBtn").onclick =
  makeQuiz;


// ======================================================
// RANDOM WORD
// ======================================================

const randomWords = [

  "achieve",
  "describe",
  "progress",
  "confident",
  "independence",
  "success",
  "beauty",
  "quick",
  "happy",
  "develop",
  "improve",
  "decide",
  "curious",
  "brave",
  "gentle",
  "fierce",
  "ancient",
  "modern",
  "complex",
  "simple",
  "generous",
  "honest",
  "reliable",
  "flexible",
  "efficient",
  "creative",
  "stubborn",
  "cautious",
  "eager",
  "grateful",
  "journey",
  "opportunity",
  "challenge",
  "solution",
  "evidence",
  "strategy",
  "balance",
  "habit",
  "routine",
  "goal",
  "obstacle",
  "benefit",
  "impact",
  "approach",
  "perspective",
  "wander",
  "observe",
  "imagine",
  "hesitate",
  "persuade",
  "struggle",
  "celebrate",
  "criticize",
  "admire",
  "apologize",
  "recommend",
  "suddenly",
  "carefully",
  "eventually",
  "obviously",
  "gradually"

];


$("#randomBtn").onclick =
  () => {

    const word =
      randomWords[
        Math.floor(
          Math.random() *
          randomWords.length
        )
      ];


    input.value =
      word;


    searchWord(
      word
    );

  };


// ======================================================
// CLICK SYNONYM / ANTONYM
// ======================================================

document.addEventListener(
  "click",
  event => {

    const tag =
      event.target.closest(
        ".tag"
      );


    if (!tag) {
      return;
    }


    const word =
      tag.dataset.word;


    if (!word) {
      return;
    }


    input.value =
      word;


    searchWord(
      word
    );

  }
);


// ======================================================
// LOAD QUIZ
// ======================================================

if (
  wordHistory.length >= 2
) {

  makeQuiz();

}
