import { GigaChat } from 'gigachat';
import { Agent } from 'node:https';

// Читаем ключ из переменной окружения
const credentials = process.env.GIGACHAT_CREDENTIALS;
if (!credentials) {
  throw new Error('Missing GIGACHAT_CREDENTIALS in environment');
}

// Для локальной разработки отключаем проверку сертификатов (в продакшене лучше настроить правильно)
const httpsAgent = new Agent({ rejectUnauthorized: false });

const client = new GigaChat({
  credentials,
  scope: 'GIGACHAT_API_PERS',      // для физических лиц
  httpsAgent,
});

export default async function handler(req, res) {
  // Разрешаем только POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  try {
    const response = await client.chat({
      messages: [{ role: 'user', content: message }],
    });

    const reply = response.choices[0]?.message?.content || 'Извините, ответ не получен.';
    res.status(200).json({ reply });
  } catch (error) {
    console.error('GigaChat error:', error);
    res.status(500).json({ error: 'Ошибка при обращении к GigaChat' });
  }
}