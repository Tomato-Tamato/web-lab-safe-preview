const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

export async function onRequestPost(context) {
  if (!context.env.AI) return json({ error: 'Workers AI still needs an AI binding named AI in Cloudflare.' }, 503);
  let body;
  try { body = await context.request.json(); } catch (_) { return json({ error: 'Invalid request.' }, 400); }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : '';
  const page = typeof body.page === 'string' ? body.page.trim().slice(0, 500) : '';
  if (!question) return json({ error: 'Enter a question.' }, 400);
  try {
    const result = await context.env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: [
        { role: 'system', content: 'You are the concise assistant inside Web Lab. Help with the website or game the user is viewing. Be clear, practical, and honest when you cannot inspect the page contents.' },
        { role: 'user', content: `${question}\n\nCurrent page or game URL: ${page || 'not available'}` }
      ],
      max_tokens: 500
    });
    const answer = typeof result === 'string' ? result.trim() : String(result?.response || result?.result?.response || '').trim();
    return json({ answer: answer || 'No text response was returned.' });
  } catch (_) {
    return json({ error: 'The free assistant is temporarily unavailable or its daily allowance has been used.' }, 502);
  }
}
