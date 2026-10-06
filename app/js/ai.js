/* ai.js — every prompt the 書僮 sends to Claude. Each call is memory-less, so each prompt carries the learner
   profile, the course, the relevant slice of the material and an exact JSON shape to return. */

const AI = (() => {
  const ENGLISH = {
    B1: 'Use simple English (CEFR B1): everyday words, short sentences (about 15 words or fewer), and explain every technical term the first time.',
    B2: 'Use clear academic English (CEFR B2): precise but plain; explain uncommon technical terms.',
    C1: 'Use natural academic English (CEFR C1), as a UQ tutor would write.',
  };

  function profile(settings = Store.state.settings) {
    return `You are 書僮 (Shūtóng), a patient study companion for one learner.
LEARNER
- An international student in the Master of Cyber Security at The University of Queensland (UQ, Brisbane), ${(settings.semester && settings.semester.name) || 'Semester 2 2026'}.
- First language: Mandarin Chinese, read in Traditional characters (Taiwan usage). English is a second language and is weakest in academic writing and speaking.
- Finds theory-heavy cyber security courses hard to study; is more comfortable with logic (programming, maths).
- Wants real understanding, not memorising, and wants to practise answering in English.
LANGUAGE RULES
- English: ${ENGLISH[settings.english] || ENGLISH.B1}
- Chinese: Traditional Chinese with Taiwan usage (程式, 資料, 網路, 資訊安全, 演算法, 函式, 變數). The first time a key term appears in Chinese text, add the English term in parentheses, e.g. 機密性 (confidentiality).
- Maths: write symbols in Unicode (¬ ∧ ∨ → ↔ ∀ ∃ ∈ ∉ ⊆ ∪ ∩ ∅ ≡ ≤ ≥ ≠ Σ ⌊ ⌋), never LaTeX.
- Code: Python 3 only; put code in the fields meant for code, not inside prose.
- Be accurate. If the material does not cover something, say so instead of inventing details.`;
  }

  function courseBlock(course) {
    if (!course) return 'COURSE: (general)';
    const kind = COURSE_KINDS[course.kind] ? COURSE_KINDS[course.kind].en : 'General';
    const lines = [`COURSE: ${course.code} ${course.name || ''}${course.nameZh ? ` (${course.nameZh})` : ''} — type: ${kind}`];
    if (course.topics && course.topics.length) lines.push(`Course topics: ${course.topics.map((t) => (typeof t === 'string' ? t : t.title)).join('; ')}`);
    const upcoming = (course.assessments || [])
      .filter((a) => !a.due || a.due >= U.today())
      .slice(0, 4)
      .map((a) => `${a.name}${a.weight ? ` (${a.weight}%)` : ''}${a.due ? ` due ${a.due}` : ''}`);
    if (upcoming.length) lines.push(`Upcoming assessment: ${upcoming.join('; ')}`);
    return lines.join('\n');
  }

  const KIND_STYLE = {
    programming:
      'For this programming course, prefer questions that make the learner predict output, trace variables, explain what code does and why, spot bugs, or describe how they would write a function. Put any code in the "code" field (Python 3, at most 12 lines).',
    math:
      'For this discrete maths course, prefer questions that ask for precise definitions, a small worked calculation, the next step of a proof, a counterexample, or which proof technique fits and why. The learner may answer with steps.',
    theory:
      'For this theory course, prefer why/how questions, applying a concept to a realistic scenario (Australian context is good: an Australian hospital, a uni, a bank, the Optus or Medibank breaches), comparing two concepts, and giving an example. Avoid pure list recall unless the list itself is examinable.',
  };

  const materialBlock = (m, text) =>
    `<material title="${(m.title || '').replace(/"/g, "'")}" kind="${m.kind || 'lecture'}"${m.week ? ` week="${m.week}"` : ''}>
${text}
</material>`;

  const NOTE_EXTRACTED = 'The material was extracted automatically from slides or a PDF, so it may be fragmented. Ignore page numbers, copyright notices and repeated headers.';

  const str = (x) => (typeof x === 'string' ? x : x == null ? '' : String(x));
  const arr = (x) => (Array.isArray(x) ? x : []);
  const pair = (x) => ({ en: str(x && x.en), zh: str(x && x.zh) });

  async function call(prompt, opts) {
    return RT.ask(prompt, { json: true, ...opts });
  }

  /* ---------- 導讀 / material guide ---------- */
  async function summarize({ course, material, text, signal, onProgress }) {
    const body = Extract.sampleEvenly(text, 60000);
    const prompt = `${profile()}

${courseBlock(course)}

TASK
Write a bilingual study guide (導讀) for the material below. The learner reads it BEFORE studying, so it must explain why the topic matters and what to get out of it, then start a Socratic conversation.
${NOTE_EXTRACTED}

${materialBlock(material, body)}

Return ONLY one JSON object with exactly these keys:
{
  "title_en": "short title of the topic",
  "title_zh": "中文標題",
  "overview_en": "3-5 short sentences: what this material is about",
  "overview_zh": "same in Traditional Chinese",
  "why_learn": [{"en": "...", "zh": "..."}],
  "goals": [{"en": "...", "zh": "..."}],
  "key_points": [{"en": "...", "zh": "..."}],
  "key_terms": [{"term": "English term", "zh": "中文", "def_en": "definition in 20 words or fewer", "example_en": "one concrete example sentence"}],
  "exam_angles": [{"en": "...", "zh": "..."}],
  "first_question": {"en": "...", "zh_hint": "...", "focus": "2-5 word topic label", "code": ""}
}
Guidance:
- why_learn: 2-4 reasons the lecturer teaches this (real cyber security work, later topics in the course, or the assessment).
- goals: 3-5 outcomes that start with a verb (Explain, Compare, Calculate, Trace, Write, Apply).
- key_points: 4-8 core ideas, one sentence each.
- key_terms: 6-12 terms the learner must know, in the order they appear.
- exam_angles: 2-4 ways this could be examined (question styles), based on the material.
- first_question: one open question answerable in 2-4 English sentences. zh_hint is a Chinese hint or translation, never the answer. "code" holds Python code if the question needs it, otherwise "".`;
    const r = await call(prompt, { tier: 'default', signal, onProgress });
    return {
      title_en: str(r.title_en),
      title_zh: str(r.title_zh),
      overview_en: str(r.overview_en),
      overview_zh: str(r.overview_zh),
      why_learn: arr(r.why_learn).map(pair),
      goals: arr(r.goals).map(pair),
      key_points: arr(r.key_points).map(pair),
      key_terms: arr(r.key_terms)
        .map((t) => ({ term: str(t.term), zh: str(t.zh), def_en: str(t.def_en), example_en: str(t.example_en) }))
        .filter((t) => t.term),
      exam_angles: arr(r.exam_angles).map(pair),
      first_question: normQuestion(r.first_question),
    };
  }

  function normQuestion(q) {
    if (!q || typeof q !== 'object') return null;
    const out = { en: str(q.en), zh: str(q.zh_hint || q.zh), focus: str(q.focus), code: str(q.code) };
    return out.en ? out : null;
  }

  /* ---------- context for tutor / chat ---------- */
  async function materialContext({ materials, query, maxChars = 9000 }) {
    const parts = [];
    const per = Math.floor(maxChars / Math.max(1, materials.length));
    for (const m of materials) {
      const text = await Store.getText(m.id);
      const s = m.summary;
      const head = s
        ? `Key points: ${s.key_points.map((p) => p.en).join(' | ')}\nKey terms: ${s.key_terms.map((t) => `${t.term} (${t.zh})`).join(', ')}`
        : '';
      parts.push(materialBlock(m, [head, Extract.pickRelevant(text, query, per)].filter(Boolean).join('\n\n')));
    }
    return parts.join('\n\n');
  }

  function courseOverviewContext(courseCode) {
    const ms = Store.state.materials.filter((m) => m.courseCode === courseCode && m.summary);
    if (!ms.length) return '';
    return ms
      .slice(0, 14)
      .map((m) => `- ${m.title}${m.week ? ` (week ${m.week})` : ''}: ${m.summary.key_points.slice(0, 5).map((p) => p.en).join(' | ')}`)
      .join('\n');
  }

  const historyBlock = (turns) => {
    if (!turns.length) return '(no earlier questions)';
    const recent = turns.slice(-6);
    const older = turns.slice(0, -6);
    const lines = older.map((t, i) => `Q${i + 1} [${t.q.focus || ''}] → ${t.fb ? t.fb.understanding : 'skipped'}`);
    recent.forEach((t, j) => {
      const n = older.length + j + 1;
      lines.push(
        `Q${n} [${t.q.focus || ''}]: ${t.q.en}${t.q.code ? `\n(code)\n${t.q.code}` : ''}\nLearner: ${t.a || '(no answer)'}\nResult: ${t.fb ? t.fb.understanding : 'skipped'}`
      );
    });
    return lines.join('\n\n');
  };

  /* ---------- Socratic / Feynman turn ---------- */
  async function tutorTurn({ course, materials, session, question, answer, signal, onProgress, images }) {
    const mode = session.mode || 'socratic';
    const query = [question.en, question.focus, answer].join(' ');
    const ctx = materials.length
      ? await materialContext({ materials, query })
      : `Summaries of the course materials studied so far:\n${courseOverviewContext(course && course.code) || '(none yet — rely on standard course knowledge)'}`;
    const covered = session.turns.map((t) => t.q.focus).filter(Boolean);
    const modeText =
      mode === 'feynman'
        ? 'MODE: Feynman technique. The learner tries to explain a concept simply, as if teaching a classmate. Judge accuracy, completeness, clarity and whether they gave a good example. Next, ask them to explain a related concept or to fix the weakest part of their explanation.'
        : 'MODE: Socratic questioning. Ask one short open question at a time (at most 40 words) that makes the learner think: why, how, what if, apply, compare, predict. Build on their last answer.';
    const prompt = `${profile()}

${courseBlock(course)}
${KIND_STYLE[course && course.kind] || ''}

${modeText}

MATERIAL (relevant parts)
${NOTE_EXTRACTED}
${ctx}

SESSION SO FAR (oldest first)
${historyBlock(session.turns)}
Topics already covered: ${covered.join(', ') || 'none'}

CURRENT QUESTION [${question.focus || ''}]
${question.en}${question.code ? `\n(code)\n${question.code}` : ''}

LEARNER'S ANSWER (may mix English and Chinese and contain mistakes)${images && images.length ? ' — the learner also attached photo(s) of handwritten working; read them as part of the answer' : ''}:
"""${answer || "(empty — the learner doesn't know)"}"""

YOUR JOB
1. Judge understanding:
   "clear" = correct, in their own words, key idea present;
   "partial" = some correct ideas but a key point missing or vague;
   "confused" = wrong, off-topic, a misconception, or "I don't know".
2. Give content feedback in Traditional Chinese (keep English terms).
3. English coaching: keep the learner's ideas and logic; fix grammar, word choice, collocations and unnatural phrasing; turn any Chinese they wrote into natural English in "corrected". List only real problems in "changes" (at most 6, most important first). If their English is fine, use "changes": [] and say so in summary_zh. For code or maths answers, focus on the reasoning and keep "changes" for English sentences only.
4. Choose next_action:
   "deeper" (they understand → harder follow-up: why/how/what-if/apply/compare),
   "explain_then_retry" (confused → explain simply, then re-ask the same idea more simply),
   "next_point" (move to a key point not covered yet),
   "wrap_up" (all key points covered or about 8+ questions asked).
5. Write the next question (unless wrap_up). Never repeat a question already asked.

Return ONLY one JSON object:
{
  "understanding": "clear" | "partial" | "confused",
  "verdict_zh": "one sentence in Chinese on how they did",
  "good": ["what they got right"],
  "missing": ["key points they missed"],
  "misconceptions": ["wrong ideas to fix; [] if none"],
  "model_answer_en": "a strong 2-4 sentence answer in simple academic English",
  "model_answer_zh": "the model answer in Chinese",
  "english": {
    "corrected": "their answer with English fixed, same ideas",
    "changes": [{"original": "...", "corrected": "...", "reason_zh": "..."}],
    "natural": "a more natural or more academic version, or \\"\\"",
    "summary_zh": "one line about their English"
  },
  "explanation": {"en": "short explanation (needed when confused or partial), else \\"\\"", "zh": "same in Chinese"},
  "next_action": "deeper" | "explain_then_retry" | "next_point" | "wrap_up",
  "next_question": {"en": "...", "zh_hint": "Chinese hint or translation, not the answer", "focus": "2-5 word topic", "code": ""},
  "card": {"front": "a flashcard question for the key idea they missed", "back": "the answer, short"}
}
Use "next_question": null only for wrap_up. Use "card": null when understanding is "clear".`;
    const r = await call(prompt, { tier: 'default', signal, onProgress, images });
    const english = r.english || {};
    const level = ['clear', 'partial', 'confused'].includes(r.understanding) ? r.understanding : 'partial';
    return {
      understanding: level,
      verdict_zh: str(r.verdict_zh),
      good: arr(r.good).map(str).filter(Boolean),
      missing: arr(r.missing).map(str).filter(Boolean),
      misconceptions: arr(r.misconceptions).map(str).filter(Boolean),
      model_answer_en: str(r.model_answer_en),
      model_answer_zh: str(r.model_answer_zh),
      english: {
        corrected: str(english.corrected),
        changes: arr(english.changes)
          .map((c) => ({ original: str(c.original), corrected: str(c.corrected), reason_zh: str(c.reason_zh) }))
          .filter((c) => c.original || c.corrected),
        natural: str(english.natural),
        summary_zh: str(english.summary_zh),
      },
      explanation: pair(r.explanation),
      next_action: str(r.next_action) || 'next_point',
      next_question: normQuestion(r.next_question),
      card: r.card && r.card.front ? { front: str(r.card.front), back: str(r.card.back) } : null,
    };
  }

  /** Opening question when a session starts without a ready-made one (Feynman, whole-course review). */
  async function openingQuestion({ course, materials, mode, concept, signal, onProgress }) {
    const ctx = materials.length
      ? await materialContext({ materials, query: concept || '', maxChars: 8000 })
      : courseOverviewContext(course && course.code) || '(no materials yet — use standard course knowledge)';
    const ask =
      mode === 'feynman'
        ? `Ask the learner to explain ${concept ? `"${concept}"` : 'one central concept from the material'} in simple English, as if teaching a classmate who missed the lecture, including one example. Keep the instruction short.`
        : 'Ask one open Socratic question about the most important idea, answerable in 2-4 English sentences.';
    const prompt = `${profile()}

${courseBlock(course)}
${KIND_STYLE[course && course.kind] || ''}

MATERIAL
${NOTE_EXTRACTED}
${ctx}

TASK
${ask}
Return ONLY JSON: {"en": "...", "zh_hint": "Chinese hint or translation, not the answer", "focus": "2-5 word topic", "code": ""}`;
    const r = await call(prompt, { tier: 'quick', signal, onProgress });
    return normQuestion(r) || { en: 'What is the most important idea in this material, and why does it matter?', zh: '這份教材最重要的觀念是什麼？為什麼重要？', focus: 'main idea', code: '' };
  }

  /** End-of-session recap. */
  async function recap({ course, session, signal, onProgress }) {
    const prompt = `${profile()}

${courseBlock(course)}

TASK
Summarise this tutoring session for the learner's notes.
${historyBlock(session.turns.map((t) => ({ ...t, a: U.truncate(t.a || '', 600) })))}

Return ONLY JSON:
{
  "summary_zh": "3-4 sentences in Chinese: what was covered and how it went",
  "strengths": ["..."],
  "gaps": ["concepts still weak, in Chinese with English terms"],
  "next_steps": ["2-4 concrete things to do next, in Chinese"],
  "english_patterns": ["recurring English mistakes with a short fix, e.g. 'is depend on → depends on（動詞不用 be）'"]
}`;
    const r = await call(prompt, { tier: 'quick', signal, onProgress });
    return {
      summary_zh: str(r.summary_zh),
      strengths: arr(r.strengths).map(str),
      gaps: arr(r.gaps).map(str),
      next_steps: arr(r.next_steps).map(str),
      english_patterns: arr(r.english_patterns).map(str),
    };
  }

  /* ---------- free chat about a material ---------- */
  async function chat({ course, materials, turns, signal, onText }) {
    const last = turns[turns.length - 1];
    const ctx = materials.length
      ? await materialContext({ materials, query: last ? last.content : '', maxChars: 12000 })
      : courseOverviewContext(course && course.code);
    const rules = `${profile()}

${courseBlock(course)}

MATERIAL
${NOTE_EXTRACTED}
${ctx || '(no material selected)'}

You are answering the learner's questions about this course. Answer in Traditional Chinese by default, keep key English terms, and add a short English version of the key sentence at the end ("In English: ...") so they learn how to say it. Use short paragraphs, bullet points, Markdown tables for comparisons, and fenced code blocks for code. If the question is outside the material, say so and answer from general knowledge.`;
    const input = [{ role: 'user', content: rules }, ...turns.slice(-10)];
    return RT.ask(input, { json: false, tier: 'default', signal, onText });
  }

  /* ---------- quick explain ---------- */
  async function explain({ text, signal, onText }) {
    const prompt = `${profile()}

Explain the following text to the learner in Traditional Chinese (Taiwan), in at most 150 words. Keep important English terms in parentheses. If it is a question, explain what it is asking, not the answer.

"""${U.truncate(text, 4000)}"""`;
    return RT.ask(prompt, { json: false, tier: 'quick', signal, onText, cache: { gcTime: 3600000 } });
  }

  /* ---------- OCR for scanned PDFs / photos ---------- */
  async function transcribe({ images, hint, signal, onProgress }) {
    const prompt = `Transcribe all text in the attached image(s) of ${hint || 'course material'} as plain text, page by page. Start each image with "[Page N]". Keep question numbers, marks and code exactly. Describe any diagram in one line inside [Diagram: ...]. Return only the transcription.`;
    const r = await RT.ask(prompt, { json: false, tier: 'default', images, signal, onProgress });
    return r.text;
  }

  /* ---------- practice questions ---------- */
  const TYPE_RULES = {
    mcq: '"mcq": 4 options, exactly one correct; wrong options are common misconceptions. Fields: options (4 strings, no "A." prefixes), answer_index (0-3).',
    tf: '"tf": a statement that is clearly true or false. Fields: answer_bool. The learner must also justify.',
    short: '"short": answer in 2-4 sentences. Fields: model_answer, rubric (2-4 marking points).',
    scenario: '"scenario": a realistic situation (Australian context welcome) where the learner applies course concepts. Fields: model_answer, rubric.',
    compare: '"compare": compare or contrast two related concepts. Fields: model_answer, rubric.',
    trace: '"trace": a short Python snippet (at most 12 lines) and the question "What does this code print?". Fields: code, expected_output (exactly what is printed).',
    debug: '"debug": Python code containing exactly one bug; the learner finds and fixes it. Fields: code, model_answer (fixed code plus one-line explanation), rubric.',
    write: '"write": write a Python function to a clear spec, with 2-3 example calls and their results in the prompt. Fields: model_answer (code), rubric.',
    parsons: '"parsons": a correct Python solution of 4-9 lines that will be shuffled for the learner to reorder. Fields: lines (in correct order, indentation kept with spaces).',
    steps: '"steps": a maths problem needing working. Fields: model_answer (numbered steps), final_answer, rubric.',
    proof: '"proof": a statement to prove. Fields: technique (e.g. direct, contrapositive, contradiction, induction), model_answer (full proof), rubric (key steps).',
  };

  async function generateQuiz({ course, materials, examMaterials, spec, weakTopics, signal, onProgress }) {
    const budget = 30000;
    const per = Math.floor(budget / Math.max(1, materials.length));
    const blocks = [];
    for (const m of materials) blocks.push(materialBlock(m, Extract.sampleEvenly(await Store.getText(m.id), per)));
    const examBlocks = [];
    for (const m of examMaterials) examBlocks.push(materialBlock(m, Extract.sampleEvenly(await Store.getText(m.id), 12000)));
    const level = { basic: 'basic (check core understanding)', standard: 'standard (typical tutorial level)', exam: 'exam level (like the final exam, multi-step)' }[spec.difficulty] || 'standard';
    const prompt = `${profile()}

${courseBlock(course)}

TASK
Create a practice set of exactly ${spec.count} questions. Difficulty: ${level}.
Use only these question types, spread across them: ${spec.types.join(', ')}.
${spec.types.map((t) => '- ' + TYPE_RULES[t]).join('\n')}
Every question also needs: "id" ("q1", "q2", ...), "type", "topic" (2-5 words), "difficulty" (1-3), "marks" (1-6), "prompt_en", "prompt_zh" (Traditional Chinese translation of the prompt to help reading; never the answer), "explanation_en", "explanation_zh" (why the answer is right, 2-4 sentences).
${examBlocks.length ? `PAST EXAM / SAMPLE EXAM (style reference): imitate its format, wording, mark allocation and difficulty, but do not copy its questions.\n${examBlocks.join('\n\n')}` : ''}
${weakTopics && weakTopics.length ? `The learner is weak on: ${weakTopics.join('; ')}. Give these topics priority.` : ''}
${spec.focus ? `The learner asked to focus on: ${spec.focus}` : ''}
Cover different topics; never test the same fact twice. Base questions on the material${materials.length ? '' : ' (no material given: use the standard content of this course)'}.
${NOTE_EXTRACTED}

${blocks.join('\n\n')}

Return ONLY JSON: {"title": "short title for this set", "questions": [ ... ]}`;
    const r = await call(prompt, { tier: 'default', signal, onProgress });
    const qs = arr(r.questions)
      .map((q, i) => normQuizQuestion(q, i))
      .filter(Boolean);
    if (!qs.length) throw { code: 'invalid_json', message: 'no questions' };
    return { title: str(r.title) || `${course.code} 練習`, questions: qs };
  }

  function normQuizQuestion(q, i) {
    if (!q || typeof q !== 'object') return null;
    const type = str(q.type);
    if (!TYPE_RULES[type]) return null;
    const out = {
      id: str(q.id) || `q${i + 1}`,
      type,
      topic: str(q.topic),
      difficulty: Number(q.difficulty) || 2,
      marks: Number(q.marks) || 1,
      prompt_en: str(q.prompt_en),
      prompt_zh: str(q.prompt_zh),
      code: str(q.code),
      explanation_en: str(q.explanation_en),
      explanation_zh: str(q.explanation_zh),
      model_answer: str(q.model_answer),
      final_answer: str(q.final_answer),
      technique: str(q.technique),
      rubric: arr(q.rubric).map(str).filter(Boolean),
    };
    if (type === 'mcq') {
      out.options = arr(q.options).map(str).slice(0, 6);
      out.answer_index = Number(q.answer_index);
      if (out.options.length < 2 || !(out.answer_index >= 0 && out.answer_index < out.options.length)) return null;
    }
    if (type === 'tf') out.answer_bool = q.answer_bool === true || q.answer_bool === 'true';
    if (type === 'trace') {
      out.expected_output = str(q.expected_output);
      if (!out.code) return null;
    }
    if (type === 'parsons') {
      out.lines = arr(q.lines).map(str).filter((l) => l.trim());
      if (out.lines.length < 3) return null;
    }
    if (!out.prompt_en && type !== 'parsons' && type !== 'trace') return null;
    return out;
  }

  /** Mark open answers in one call. items: [{id, type, prompt, code, model_answer, rubric, answer, expected_output}] */
  async function grade({ course, items, signal, onProgress, images }) {
    const prompt = `${profile()}

${courseBlock(course)}

TASK
Mark the learner's answers fairly and specifically, like a UQ tutor. English is their second language: the score reflects CONTENT only; give English feedback separately.
- "trace": compare with the expected output; if different, explain step by step what the code really does.
- "write" / "debug": check the logic by mentally running the examples; mention edge cases; ignore small style issues.
- "steps" / "proof": check every step; point to the first wrong or missing step.
- prose answers ("short", "scenario", "compare", "tf" justification): check each rubric point.
${images && images.length ? '- The learner attached photo(s) of handwritten working for item ' + items.map((x) => x.id).join(', ') + '; read them as their answer.' : ''}

ITEMS
${JSON.stringify(items, null, 1)}

Return ONLY JSON: {"results": [{
  "id": "q1",
  "score": 0 | 0.25 | 0.5 | 0.75 | 1,
  "verdict": "correct" | "partial" | "incorrect",
  "feedback_zh": "2-3 sentences in Chinese: what is right and what is missing",
  "missing": ["rubric points they missed"],
  "better_answer_en": "a model answer built from their answer (2-5 sentences, or corrected code)",
  "english_changes": [{"original": "...", "corrected": "...", "reason_zh": "..."}]
}]}
english_changes: at most 4, only for English prose answers; [] for code or maths.`;
    const r = await call(prompt, { tier: 'default', signal, onProgress, images });
    const out = {};
    for (const x of arr(r.results)) {
      if (!x || !x.id) continue;
      const score = U.clamp(Number(x.score) || 0, 0, 1);
      out[str(x.id)] = {
        score,
        verdict: ['correct', 'partial', 'incorrect'].includes(x.verdict) ? x.verdict : score >= 0.99 ? 'correct' : score > 0 ? 'partial' : 'incorrect',
        feedback_zh: str(x.feedback_zh),
        missing: arr(x.missing).map(str),
        better_answer_en: str(x.better_answer_en),
        english_changes: arr(x.english_changes).map((c) => ({ original: str(c.original), corrected: str(c.corrected), reason_zh: str(c.reason_zh) })),
      };
    }
    return out;
  }

  /* ---------- planning ---------- */
  async function plan({ from, to, focusNote, signal, onProgress }) {
    const s = Store.state;
    const today = U.today();
    const sem = s.settings.semester;
    const courses = Store.courses().map((c) => {
      const mats = s.materials.filter((m) => m.courseCode === c.code);
      const turns = s.sessions.filter((x) => x.courseCode === c.code).flatMap((x) => x.turns || []);
      const levels = turns.filter((t) => t.fb).map((t) => t.fb.understanding);
      const weak = turns.filter((t) => t.fb && t.fb.understanding !== 'clear').map((t) => t.q.focus).filter(Boolean);
      const due = s.cards.filter((k) => k.courseCode === c.code && SRS.isDue(k, today)).length;
      return {
        code: c.code,
        name: c.name,
        type: c.kind,
        exam: c.exam || null,
        assessments: (c.assessments || []).filter((a) => a.status !== 'done').map((a) => ({ name: a.name, due: a.due || null, weight: a.weight || null })),
        materials_total: mats.length,
        materials_with_guide: mats.filter((m) => m.summary).length,
        answers: levels.length,
        clear_rate: levels.length ? Math.round((levels.filter((l) => l === 'clear').length / levels.length) * 100) + '%' : 'n/a',
        weak_topics: [...new Set(weak)].slice(-6),
        cards_due_today: due,
        needs_preview: !!c.preview,
        weekly_quiz: (() => {
          const q = weeklyQuizOf(c);
          return q ? `in-class quiz every week (weeks ${q.fromWeek}-${q.toWeek}) in the ${CLASS_TYPES[q.classType] || q.classType}, on ${q.covers === 'this' ? "that week's" : "the previous week's"} content${q.best && q.of ? `; best ${q.best} of ${q.of} count` : ''}${q.weight ? `; ${q.weight}% in total` : ''}` : null;
        })(),
      };
    });
    const timetable = (s.timetable.classes || []).map(classLine);
    const open = s.tasks
      .filter((t) => !t.done && (!t.date || (t.date >= from && t.date <= to)))
      .map((t) => ({ date: t.date, course: t.courseCode, title: t.title, minutes: t.minutes }));
    const prompt = `${profile()}

TASK
Make a realistic day-by-day study plan from ${from} to ${to} (inclusive).
Today is ${today} (${U.fmtDate(today)}). Semester calendar: ${JSON.stringify(sem)}. Current phase: ${semesterPhase(today, sem).label}.
Study time available: weekdays ${s.settings.minutes.weekday} minutes, weekends ${s.settings.minutes.weekend} minutes. Do not exceed these.
Public holidays (no classes): ${JSON.stringify(sem.holidays || [])}.
WEEKLY TIMETABLE (teaching weeks only; never schedule study during these times)
${timetable.length ? timetable.join('\n') : '(not entered yet)'}
COURSES (with deadlines and the learner's current state)
${JSON.stringify(courses, null, 1)}
TASKS ALREADY PLANNED (keep them; do not duplicate; tasks starting with a course code and "預習", "看…錄影" or "…前，複習" come from the timetable): ${JSON.stringify(open)}
${focusNote ? `THE LEARNER SAYS: ${focusNote}` : ''}

RULES
- Deadlines first: finish assignments at least 2 days before they are due; plan exam preparation backwards from exam dates (final exams fall in the exam period if no date is given).
- Every day: 15-20 minutes of flashcard review (title "複習今日閃卡").
- Mix courses within a day (interleaving), at most 3 courses a day.
- Theory courses: active methods (Feynman explanation in English, scenario questions, compare tables), not re-reading.
- Programming and maths: practice problems, code tracing, past exam questions; timed practice closer to exams.
- English: at least 3 days a week include an English answering task (kind "english").
- Courses with needs_preview=true are previewed before lectures; the preview and class-prep tasks already exist, so plan around them instead of adding more previews.
- Courses with weekly_quiz get a quiz-prep task the day before each quiz (also already in the list); keep that evening light for other work.
- Soon after each lecture (within 24 hours), a short review: 書僮問答 5 題 or 導讀 of that week's slides. Lectures marked "watch recording" must be watched within 2 days.
- Task titles in Traditional Chinese, specific and doable, starting with the course code, e.g. "MATH7861：用書僮做 6 題歸納法證明". 20-90 minutes each.

Return ONLY JSON:
{
  "advice_zh": "3-5 sentences: the overall strategy for this period",
  "weeks": [{"label": "e.g. 10/5-10/11 (W10)", "focus_zh": "one line"}],
  "tasks": [{"date": "YYYY-MM-DD", "course": "CODE or null", "title": "...", "minutes": 45, "kind": "review" | "practice" | "study" | "assignment" | "exam" | "english", "why": "short reason in Chinese"}]
}`;
    const r = await call(prompt, { tier: 'default', signal, onProgress });
    const codes = new Set(Store.courses().map((c) => c.code));
    return {
      advice_zh: str(r.advice_zh),
      weeks: arr(r.weeks).map((w) => ({ label: str(w.label), focus_zh: str(w.focus_zh) })),
      tasks: arr(r.tasks)
        .filter((t) => t && U.isYmd(t.date) && str(t.title))
        .map((t) => ({
          date: t.date,
          courseCode: codes.has(t.course) ? t.course : null,
          title: str(t.title),
          minutes: U.clamp(Number(t.minutes) || 30, 5, 240),
          kind: str(t.kind) || 'study',
          why: str(t.why),
        })),
    };
  }

  /** Messy announcements / course profile text → assessments + tasks. */
  async function parseInfo({ text, signal, onProgress }) {
    const sem = Store.state.settings.semester;
    const courses = Store.courses().map((c) => `${c.code} ${c.name}`);
    const prompt = `${profile()}

TASK
The learner pasted messy course information (announcements, assignment specs, a course profile table, emails). Extract what they must do.
Courses: ${courses.join('; ')}
Today: ${U.today()}. Semester calendar: ${JSON.stringify(sem)} (teaching week 1 starts on the "start" date; the mid-semester break does not count as a teaching week).

TEXT
"""${U.truncate(text, 20000)}"""

Return ONLY JSON:
{
  "assessments": [{"course": "CODE", "name": "...", "due": "YYYY-MM-DD or null", "time": "HH:MM or \\"\\"", "weight": 25, "kind": "assignment" | "exam" | "quiz" | "project" | "presentation" | "other", "note": "short note"}],
  "tasks": [{"course": "CODE or null", "title": "actionable task in Traditional Chinese", "due": "YYYY-MM-DD or null", "priority": 1, "minutes": 60, "why": "short Chinese reason for its priority/order"}],
  "schedule": [{"course": "CODE", "week": 10, "topic": "lecture topic for that teaching week, short, in the original language"}],
  "notes_zh": "anything important that is not a task (rules, hurdles, exam conditions), in Chinese"
}
"schedule" is only for weekly learning activities / lecture topics (e.g. a course profile's "Learning activities" table); use [] if the text has none.
Interpret relative dates ("next Friday", "Week 11") with the calendar. If a date is unknown, use null — never guess. priority: 1 = do first.`;
    const r = await call(prompt, { tier: 'default', signal, onProgress });
    const codes = new Set(Store.courses().map((c) => c.code));
    return {
      assessments: arr(r.assessments)
        .filter((a) => a && str(a.name))
        .map((a) => ({
          courseCode: codes.has(a.course) ? a.course : null,
          name: str(a.name),
          due: U.isYmd(a.due) ? a.due : null,
          time: str(a.time),
          weight: Number(a.weight) || null,
          kind: str(a.kind) || 'assignment',
          note: str(a.note),
        })),
      tasks: arr(r.tasks)
        .filter((t) => t && str(t.title))
        .map((t) => ({
          courseCode: codes.has(t.course) ? t.course : null,
          title: str(t.title),
          due: U.isYmd(t.due) ? t.due : null,
          priority: U.clamp(Number(t.priority) || 2, 1, 3),
          minutes: U.clamp(Number(t.minutes) || 45, 5, 600),
          why: str(t.why),
        })),
      schedule: arr(r.schedule)
        .filter((x) => x && codes.has(x.course) && Number(x.week) >= 1 && Number(x.week) <= 14 && str(x.topic))
        .map((x) => ({ courseCode: x.course, week: Number(x.week), topic: U.truncate(str(x.topic), 140) })),
      notes_zh: str(r.notes_zh),
    };
  }

  /* ---------- 預習 / lecture preview ---------- */
  async function preview({ course, week, topic, date, material, signal, onProgress }) {
    const text = material ? Extract.sampleEvenly(await Store.getText(material.id), 40000) : '';
    const earlier = Store.state.materials
      .filter((m) => m.courseCode === course.code && m.summary && (!m.week || m.week < week))
      .sort((a, b) => (b.week || 0) - (a.week || 0))
      .slice(0, 4)
      .map((m) => `- ${m.title}${m.week ? ` (week ${m.week})` : ''}: ${m.summary.key_points.slice(0, 4).map((p) => p.en).join(' | ')}`)
      .join('\n');
    const prompt = `${profile()}

${courseBlock(course)}
${KIND_STYLE[course.kind] || ''}

TASK
Write a short PREVIEW guide (預習) for the learner to read BEFORE the week ${week} lecture${date ? ` on ${date}` : ''}${topic ? ` about "${topic}"` : ''}. The goal is to arrive prepared: know what is coming, refresh what it builds on, and try a few easy warm-up questions. Keep it light: about 20-30 minutes of work.
${material ? `The lecture slides are below; base the preview on them.\n${NOTE_EXTRACTED}\n${materialBlock(material, text)}` : `No slides are available yet: use the standard content of this topic in a course like this, and say so in "basis_zh".`}
${earlier ? `Earlier materials the learner has studied:\n${earlier}` : ''}

Return ONLY one JSON object:
{
  "title_en": "topic title",
  "title_zh": "中文標題",
  "basis_zh": "one line: based on the slides, or a general preview of the topic",
  "what_en": "2-3 short sentences: what this lecture will teach",
  "what_zh": "same in Traditional Chinese",
  "why_en": "1-2 sentences: why it matters (later topics, assessment, real use)",
  "why_zh": "same in Chinese",
  "prerequisites": [{"en": "concept to refresh first", "zh": "中文"}],
  "key_terms": [{"term": "English term", "zh": "中文", "def_en": "definition in 20 words or fewer", "example_en": "one short example"}],
  "watch_for": [{"en": "what to listen for in the lecture", "zh": "中文"}],
  "warmup": [{"q_en": "easy warm-up question", "q_zh": "中文提示", "code": "", "answer_en": "short answer", "answer_zh": "中文解答"}],
  "ask_in_class": ["a question worth asking the lecturer or tutor, in English"],
  "minutes": 25
}
Counts: prerequisites 2-4, key_terms 5-8, watch_for 3-4, warmup 2-3 (programming: predict-the-output or small reasoning; maths: a tiny example or definition check), ask_in_class 2-3.`;
    const r = await call(prompt, { tier: 'default', signal, onProgress });
    return {
      title_en: str(r.title_en) || topic || `Week ${week}`,
      title_zh: str(r.title_zh),
      basis_zh: str(r.basis_zh),
      what_en: str(r.what_en),
      what_zh: str(r.what_zh),
      why_en: str(r.why_en),
      why_zh: str(r.why_zh),
      prerequisites: arr(r.prerequisites).map(pair),
      key_terms: arr(r.key_terms)
        .map((t) => ({ term: str(t.term), zh: str(t.zh), def_en: str(t.def_en), example_en: str(t.example_en) }))
        .filter((t) => t.term),
      watch_for: arr(r.watch_for).map(pair),
      warmup: arr(r.warmup)
        .map((w) => ({ q_en: str(w.q_en), q_zh: str(w.q_zh), code: str(w.code), answer_en: str(w.answer_en), answer_zh: str(w.answer_zh) }))
        .filter((w) => w.q_en),
      ask_in_class: arr(r.ask_in_class).map(str).filter(Boolean),
      minutes: U.clamp(Number(r.minutes) || 25, 5, 90),
    };
  }

  /* ---------- 考前重點 / last-minute sheet for a weekly quiz ---------- */
  async function quizSheet({ course, week, covers, lectures, topic, date, time, classLabel, materials, signal, onProgress }) {
    const budget = Math.floor(42000 / Math.max(1, materials.length));
    const blocks = [];
    for (const m of materials) blocks.push(materialBlock(m, Extract.sampleEvenly(await Store.getText(m.id), budget)));
    const mistakes = Store.state.cards
      .filter((c) => c.courseCode === course.code && c.kind === 'mistake')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 6)
      .map((c) => `- ${U.truncate(c.front, 160)}${c.extra && c.extra.topic ? ` [${c.extra.topic}]` : ''}`)
      .join('\n');
    const prompt = `${profile()}

${courseBlock(course)}
${KIND_STYLE[course.kind] || ''}

TASK
The learner sits a short in-class quiz in the week ${week} ${classLabel || 'class'}${date ? ` on ${date}${time ? ` at ${time}` : ''}` : ''}. It tests the week ${covers} content${lectures ? ` (lectures ${lectures})` : ''}${topic ? ` ("${topic}")` : ''}. Write a one-page LAST-MINUTE REVIEW SHEET (考前重點) to read in 15-20 minutes right before the quiz.
Focus on what a short quiz on this content can ask: definitions to state precisely, rules and theorems to apply, and the standard question types with the exact steps to answer them. Keep every item short; this is a checklist, not a textbook.
${blocks.length ? `${NOTE_EXTRACTED}
${blocks.join('\n\n')}` : `No slides are available: use the standard content of this topic in a course like this, and say so in "scope_zh".`}
${mistakes ? `Recent mistakes the learner made in this course (cover the matching traps):\n${mistakes}` : ''}

Return ONLY one JSON object:
{
  "title_en": "topic title",
  "title_zh": "中文標題",
  "scope_zh": "one line: what this quiz covers (or that no slides were given)",
  "must_know": [{"en": "core fact in one sentence", "zh": "中文"}],
  "definitions": [{"term": "English term", "zh": "中文", "def_en": "precise definition as it should be written in the quiz", "notation": "symbols, or empty"}],
  "rules": [{"name_en": "rule or theorem", "zh": "中文名稱", "statement": "the rule in symbols or one sentence", "use_when_zh": "什麼時候用"}],
  "patterns": [{"type_en": "question type", "type_zh": "題型", "steps_en": ["step"], "example_q": "a short example question", "example_a": "its worked answer, step by step, short"}],
  "traps": [{"en": "common mistake", "zh": "中文"}],
  "phrases": [{"en": "a sentence pattern for writing answers or proofs in English", "zh": "中文"}],
  "selfcheck": [{"q_en": "quick question", "q_zh": "中文提示", "a_en": "short answer", "a_zh": "中文解答"}]
}
Counts: must_know 4-7, definitions 4-8, rules 2-6, patterns 2-4 (steps 3-6 each), traps 3-5, phrases 3-5, selfcheck 4-5 (answerable in under a minute each).`;
    const r = await call(prompt, { tier: 'default', signal, onProgress });
    return {
      title_en: str(r.title_en) || topic || `Week ${covers}`,
      title_zh: str(r.title_zh),
      scope_zh: str(r.scope_zh),
      must_know: arr(r.must_know).map(pair).filter((x) => x.en),
      definitions: arr(r.definitions)
        .map((d) => ({ term: str(d.term), zh: str(d.zh), def_en: str(d.def_en), notation: str(d.notation) }))
        .filter((d) => d.term),
      rules: arr(r.rules)
        .map((x) => ({ name_en: str(x.name_en), zh: str(x.zh), statement: str(x.statement), use_when_zh: str(x.use_when_zh) }))
        .filter((x) => x.name_en || x.statement),
      patterns: arr(r.patterns)
        .map((x) => ({ type_en: str(x.type_en), type_zh: str(x.type_zh), steps_en: arr(x.steps_en).map(str).filter(Boolean), example_q: str(x.example_q), example_a: str(x.example_a) }))
        .filter((x) => x.type_en),
      traps: arr(r.traps).map(pair).filter((x) => x.en),
      phrases: arr(r.phrases).map(pair).filter((x) => x.en),
      selfcheck: arr(r.selfcheck)
        .map((x) => ({ q_en: str(x.q_en), q_zh: str(x.q_zh), a_en: str(x.a_en), a_zh: str(x.a_zh) }))
        .filter((x) => x.q_en),
    };
  }

  /* ---------- 題型練習 / skills drill (maths): worked examples, then easy problems to try ---------- */
  async function drill({ course, materials, scope, signal, onProgress }) {
    const budget = Math.floor(40000 / Math.max(1, materials.length));
    const blocks = [];
    for (const m of materials) blocks.push(materialBlock(m, Extract.sampleEvenly(await Store.getText(m.id), budget)));
    const prompt = `${profile()}

${courseBlock(course)}

TASK
Build a SKILLS DRILL${scope ? ` for ${scope}` : ''}. For this course the learner does NOT want Socratic questioning; they want to become fluent at the standard question types by first studying fully worked solutions, then doing easy problems of the same types themselves.
Stage 1 "examples": 3 worked examples. Each is an easy, typical problem with a complete step-by-step solution written the way a marker expects: one line per step, each with a short Traditional Chinese note on why that step is done.
Stage 2 "basics": 4 easy problems of the same types (one per question type where possible, different numbers or objects from the examples), for the learner to solve. Each has a hint that does not give the answer away, and a complete step-by-step solution to compare against.
Cover the main question types of the material, in the order they appear. Keep the numbers and objects small so each problem takes 2-5 minutes. Write maths in Unicode, never LaTeX.
${blocks.length ? `${NOTE_EXTRACTED}\n${blocks.join('\n\n')}` : 'No slides are available: use the standard content of this topic in a course like this.'}

Return ONLY one JSON object:
{
  "title_en": "short topic title",
  "title_zh": "中文標題",
  "types": [{"en": "question type", "zh": "題型"}],
  "examples": [{"type_en": "question type", "prompt_en": "the problem", "prompt_zh": "題目的中文翻譯（幫助閱讀，不給答案）", "steps": [{"en": "one step of the solution", "why_zh": "為什麼這樣做"}], "answer_en": "the final answer", "tip_zh": "同類題的關鍵（一句話）"}],
  "basics": [{"type_en": "question type", "prompt_en": "the problem", "prompt_zh": "題目的中文翻譯", "hint_zh": "提示（不能直接給答案）", "steps": [{"en": "one step", "why_zh": "為什麼"}], "answer_en": "the final answer"}]
}
Counts: types 2-4, examples exactly 3 (steps 3-7 each), basics exactly 4 (steps 2-6 each).`;
    const r = await call(prompt, { tier: 'default', signal, onProgress });
    const steps = (x) => arr(x).map((st) => (typeof st === 'string' ? { en: st, why_zh: '' } : { en: str(st && st.en), why_zh: str(st && st.why_zh) })).filter((st) => st.en);
    const item = (x) => ({ type_en: str(x.type_en), prompt_en: str(x.prompt_en), prompt_zh: str(x.prompt_zh), steps: steps(x.steps), answer_en: str(x.answer_en) });
    return {
      title_en: str(r.title_en) || scope || '',
      title_zh: str(r.title_zh),
      types: arr(r.types).map(pair).filter((t) => t.en),
      examples: arr(r.examples)
        .map((x) => ({ ...item(x), tip_zh: str(x.tip_zh) }))
        .filter((x) => x.prompt_en && x.steps.length),
      basics: arr(r.basics)
        .map((x) => ({ ...item(x), hint_zh: str(x.hint_zh) }))
        .filter((x) => x.prompt_en && x.steps.length),
    };
  }

  return { profile, preview, quizSheet, drill, summarize, tutorTurn, openingQuestion, recap, chat, explain, transcribe, generateQuiz, grade, plan, parseInfo, TYPE_RULES };
})();
