// ==========================================
// RATE LIMIT EM MEMÓRIA
// ==========================================
const rateLimit = new Map();

function checkRateLimit(key, limit = 5, windowMs = 60000) {
    const now = Date.now();

    if (rateLimit.size > 1000) {
        rateLimit.clear();
    }

    if (!rateLimit.has(key)) {
        rateLimit.set(key, []);
    }

    const timestamps = rateLimit.get(key).filter(ts => now - ts < windowMs);

    if (timestamps.length >= limit) {
        return false;
    }

    timestamps.push(now);
    rateLimit.set(key, timestamps);

    return true;
}

export default async function handler(req, res) {

    // ==========================================
    // MÉTODO
    // ==========================================
    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido' });
    }

    // ==========================================
    // API KEY
    // ==========================================
    const apiKey = req.headers['x-api-key'];

    if (apiKey !== process.env.API_SECRET) {
        return res.status(401).json({ erro: "Não autorizado" });
    }

    // ==========================================
    // BODY
    // ==========================================
    const body = req.body;

    if (!body) {
        return res.status(400).json({ erro: 'Body vazio' });
    }

    const { telefone, nome, data, hora, servico } = body;

    // ==========================================
    // VALIDAÇÃO
    // ==========================================
    if (!telefone || !nome || !data || !hora || !servico) {
        return res.status(400).json({ erro: 'Dados incompletos' });
    }

    const telefoneLimpo = telefone.replace(/\D/g, '');

    if (!/^\d{10,11}$/.test(telefoneLimpo)) {
        return res.status(400).json({ erro: 'Telefone inválido' });
    }

    // ==========================================
    // RATE LIMIT
    // ==========================================
    if (!checkRateLimit(`tel:${telefoneLimpo}`, 3, 60000)) {
        return res.status(429).json({ erro: "Muitas tentativas para este número." });
    }

    // ==========================================
    // SANITIZAÇÃO
    // ==========================================
    const nomeSeguro = nome.replace(/<[^>]*>?/gm, '').substring(0, 50).trim();
    const servicoSeguro = servico.replace(/<[^>]*>?/gm, '').substring(0, 50).trim();

    const mensagem = `Olá, ${nomeSeguro}! Aqui é da Barbearia do Gomes

Seu agendamento de *${servicoSeguro}* no dia *${data}* às *${hora}* foi confirmado!

Te esperamos!`;

    // ==========================================
    // ENV
    // ==========================================
    const instanceId = process.env.ULTRAMSG_INSTANCE;
    const token = process.env.ULTRAMSG_TOKEN;

    if (!instanceId || !token) {
        console.error("ENV não configurado");
        return res.status(500).json({ erro: 'Configuração do servidor inválida' });
    }

    const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;

    // ==========================================
    // FORMATAÇÃO DO NÚMERO
    // ==========================================
    const numeroFormatado = telefoneLimpo.startsWith('55')
        ? `+${telefoneLimpo}`
        : `+55${telefoneLimpo}`;

    console.log("Número enviado:", numeroFormatado);

    // ==========================================
    // ENVIO WHATSAPP
    // ==========================================
    try {

        const resposta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: token,
                to: numeroFormatado,
                body: mensagem
            })
        });

        const dataResposta = await resposta.json();

        console.log("UltraMsg resposta:", dataResposta);

        // ❌ ERRO DA ULTRAMSG
        if (!resposta.ok || dataResposta.error) {
            console.error("ULTRAMSG ERRO:", JSON.stringify(dataResposta, null, 2));

            return res.status(500).json({
                erro: 'Falha ao enviar WhatsApp',
                detalhe: dataResposta
            });
        }

        // ✅ SUCESSO
        return res.status(200).json({
            sucesso: true,
            mensagem: 'WhatsApp enviado com sucesso'
        });

    } catch (erro) {
        console.error("Erro geral:", erro);
        return res.status(500).json({ erro: 'Erro no servidor' });
    }
}