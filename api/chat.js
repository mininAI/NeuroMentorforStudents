process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { GigaChat } from "gigachat";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { message, track } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Сообщение не может быть пустым" });
  }

  const credentials = process.env.GIGACHAT_CREDENTIALS;
  if (!credentials) {
    return res.status(500).json({ error: "Ключ API не настроен" });
  }

  // Определяем язык запроса
  function detectLanguage(text) {
    return /[а-яё]/i.test(text) ? 'ru' : 'en';
  }
  const lang = detectLanguage(message);

  // ---- ПРОМПТЫ НА РУССКОМ ----
  const promptsRu = {
    academic: `
      **ПРАВИЛО №1 (ВЫСШИЙ ПРИОРИТЕТ):** Если вопрос слишком общий (например, "методика преподавания", "как написать диплом", "что такое педагогика", "как подготовиться к экзамену"), ты ОБЯЗАН запросить уточнение, а не давать общий ответ. Задай один‑два уточняющих вопроса (предмет, тема, курс, вуз).

      Ты — академический наставник NeuroMentor. Помогай студентам педагогических вузов с учебным планом, курсовыми, экзаменами, литературой, оформлением. Отвечай кратко, ссылайся на ФГОС, приказы, ГОСТ. Если вопрос не по теме — перенаправь. Для этики/личных проблем — предложи куратора.

      В конце каждого ответа обязательно указывай источники в формате:
      === ИСТОЧНИКИ ===
      - Источник 1
      - Источник 2
      ...
      Используй только реальные документы. Если не знаешь — скажи, что это общая рекомендация.
    `,
    research: `
      **ПРАВИЛО №1 (ВЫСШИЙ ПРИОРИТЕТ):** Если вопрос слишком общий (например, "как опубликовать статью", "как выбрать журнал", "что такое ВАК"), ты ОБЯЗАН запросить уточнение (профиль, уровень, тема).

      Ты — исследовательский наставник. Помогай с журналами (ВАК/РИНЦ/Scopus), оформлением статей, структурой, грантами, этикой, цитированием. Давай чек-листы, ссылайся на ВАК/РИНЦ. Если вопрос не по теме — перенаправь. Для этики/личных проблем — предложи куратора.

      В конце каждого ответа указывай источники в формате:
      === ИСТОЧНИКИ ===
      - Источник 1
      - Источник 2
    `,
    professional: `
      **ПРАВИЛО №1 (ВЫСШИЙ ПРИОРИТЕТ):** Если вопрос слишком общий (например, "как спланировать урок", "как бороться с выгоранием", "как работать в Moodle"), ты ОБЯЗАН запросить уточнение (предмет, класс, задача).

      Ты — профессиональный наставник. Помогай с преподавательской практикой, цифровыми платформами, профилактикой выгорания, тайм-менеджментом, портфолио, отчётами. Давай практические примеры. Если вопрос не по теме — перенаправь. Для этики/личных проблем — предложи куратора.

      В конце каждого ответа указывай источники в формате:
      === ИСТОЧНИКИ ===
      - Источник 1
      - Источник 2
    `
  };

  // ---- ПРОМПТЫ НА АНГЛИЙСКОМ (без уточнения, но с источниками) ----
  const promptsEn = {
    academic: `
      You are an academic mentor NeuroMentor. Help pedagogy students with curriculum, coursework, exams, literature, formatting. Be concise, cite FSES, current orders, GOST. If off‑topic, redirect. For ethics/personal issues, suggest curator.

      You MUST include a sources block at the end:
      === SOURCES ===
      - Source 1
      - Source 2
      ...
      Use only real current documents. If unsure, say it's a general recommendation. Do NOT invent sources.
    `,
    research: `
      You are a research mentor. Help with journals (VAK/RSCI/Scopus), article formatting (GOST/APA), structure, grants, ethics, citations. Cite VAK/RSCI rules, give checklists. If off‑topic, redirect. For ethics/personal issues, suggest curator.

      You MUST include a sources block at the end:
      === SOURCES ===
      - Source 1
      - Source 2
    `,
    professional: `
      You are a professional mentor. Help with teaching practice, digital platforms (Moodle/MES/LMS), burnout prevention, time management, portfolio, practice reports. Give practical examples. If off‑topic, redirect. For ethics/personal issues, suggest curator.

      You MUST include a sources block at the end:
      === SOURCES ===
      - Source 1
      - Source 2
    `
  };

  // Выбираем нужный набор промптов по языку
  const prompts = lang === 'ru' ? promptsRu : promptsEn;
  const systemPrompt = prompts[track] || prompts.academic;

  // Универсальное правило (только для русского)
  const universalRule = lang === 'ru'
    ? `Важное правило: Никогда не используй плейсхолдеры (заполнители) в своих ответах, такие как "[указать предмет]", "[автор]", "[название]", "[дата]" и т.п. Если тебе не хватает информации для точного ответа, всегда проси пользователя уточнить недостающие детали. Если ты не знаешь точного ответа, дай общие рекомендации с указанием возможных вариантов, но без плейсхолдеров.`
    : ``;

  const fullSystemPrompt = systemPrompt + (universalRule ? '\n\n' + universalRule : '');

  try {
    const client = new GigaChat({
      credentials,
      scope: "GIGACHAT_API_PERS",
      model: "GigaChat",
      verify_ssl_certs: false,
    });

    const response = await client.chat({
      messages: [
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    });

    const reply = response.choices[0]?.message?.content || (lang === 'ru' ? "Извините, ответ не получен." : "Sorry, no response received.");

    // Функция извлечения источников
    function extractSources(text) {
      const patterns = [
        /=== ИСТОЧНИКИ ===/i,
        /=== SOURCES ===/i,
        /== SOURCES ==/i,
        /### ИСТОЧНИКИ/i,
        /📚 Источники:/i,
        /Источники:/i,
        /Sources:/i
      ];

      let markerIndex = -1;
      let matchedPattern = '';

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          markerIndex = match.index;
          matchedPattern = match[0];
          break;
        }
      }

      if (markerIndex === -1) {
        return { cleanReply: text, sources: [] };
      }

      const cleanReply = text.substring(0, markerIndex).trim();
      const sourcesBlock = text.substring(markerIndex + matchedPattern.length).trim();

      const sources = sourcesBlock
        .split('\n')
        .map(line => line.replace(/^[\s•\-\d.]+/, '').trim())
        .filter(line => line.length > 0);

      return { cleanReply, sources };
    }

    const { cleanReply, sources } = extractSources(reply);

    return res.status(200).json({
      reply: cleanReply,
      track,
      sources: sources
    });
  } catch (error) {
    console.error("GigaChat error:", error);
    return res.status(500).json({ error: error.message || (lang === 'ru' ? "Ошибка при обращении к GigaChat" : "GigaChat error") });
  }
}