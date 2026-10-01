const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

export async function onRequestPost(context) {
  if (!context.env.OPENAI_API_KEY) return json({ error: 'The site owner still needs to add the OPENAI_API_KEY secret in Cloudflare.' }, 503);
  let body;
  try { body = await context.request.json(); } catch (_) { return json({ error: 'Invalid request.' }, 400); }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : '';
  const page = typeof body.page === 'string' ? body.page.trim().slice(0, 500) : '';
  if (!question) return json({ error: 'Enter a question.' }, 400);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${context.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: context.env.OPENAI_MODEL || 'gpt-6-astra',
        instructions: 'You are the concise assistant inside Web Lab. Help with the website or game the user is viewing. Be clear, practical, and honest when you cannot inspect the page contents.',
        input: `${question}\n\nCurrent page or game URL: ${page || 'not available'}`,
        max_output_tokens: 500
      })
    });
    const result = await response.json();
    if (!response.ok) return json({ error: result?.error?.message || 'OpenAI could not answer that question.' }, response.status);
    const answer = (result.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
    return json({ answer: answer || 'No text response was returned.' });
  } catch (_) {
    return json({ error: 'The assistant could not connect right now.' }, 502);
  }
}
