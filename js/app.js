import { doc, setDoc, updateDoc, deleteField, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db, horariosFicha } from './firebase.js';

// ATENÇÃO: por ser executada no navegador, esta chave é sempre visível a
// qualquer visitante (via "Ver código-fonte"). Ela NÃO substitui uma
// autenticação real — hoje serve apenas como uma barreira simples contra
// chamadas automatizadas triviais à API de WhatsApp. Se quiser reforçar,
// vale complementar com checagem de origem (Origin/Referer) no back-end.
const WHATSAPP_API_KEY = 'durrobarber_2026_super_key';

let horaSelecionada = null;
let dadosDoDiaAtual = {};
let ouvinteFirebase = null;
let servicoDuracaoSlots = 1;
let servicoSelecionadoNome = 'Corte Simples';

function sanitizarTexto(texto) {
    return texto.replace(/<[^>]*>?/gm, '').replace(/[^\w\sÀ-ÿ]/gi, '').trim();
}

function validarTelefone(tel) {
    const limpo = tel.replace(/\D/g, '');
    return /^(\d{10,11})$/.test(limpo);
}

// Filtra o que o usuário digita em tempo real, além de barrar colar
// conteúdo inválido: nome aceita só letras/espaços, telefone só dígitos.
function configurarValidacaoDeCampos() {
    const campoNome = document.getElementById('clienteNome');
    const campoTelefone = document.getElementById('clienteNumero');

    campoNome.addEventListener('input', () => {
        const posicao = campoNome.selectionStart;
        const valorFiltrado = campoNome.value.replace(/[^A-Za-zÀ-ÿ\s]/g, '');
        if (valorFiltrado !== campoNome.value) {
            const diferenca = campoNome.value.length - valorFiltrado.length;
            campoNome.value = valorFiltrado;
            campoNome.setSelectionRange(posicao - diferenca, posicao - diferenca);
        }
    });

    campoTelefone.addEventListener('input', () => {
        const valorFiltrado = campoTelefone.value.replace(/\D/g, '').slice(0, 11);
        if (valorFiltrado !== campoTelefone.value) {
            campoTelefone.value = valorFiltrado;
        }
    });
}

function inicializar() {
    const dataSelect = document.getElementById('dataSelect');
    const dateCardsContainer = document.getElementById('dateCardsContainer');
    const hoje = new Date();
    let diasGerados = 0;
    let diasAvancados = 0;

    dataSelect.innerHTML = '';
    dateCardsContainer.innerHTML = '';

    while (diasGerados < 15) {
        let d = new Date(hoje);
        d.setDate(hoje.getDate() + diasAvancados);
        let diaSemanaNum = d.getDay();

        if (diaSemanaNum !== 0 && diaSemanaNum !== 1) {
            let dataFormatada = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            let diaSemanaCurto = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').substring(0, 3);
            let diaNumero = d.toLocaleDateString('pt-BR', { day: '2-digit' });
            let valorData = dataFormatada.replaceAll('/', '-');

            let option = `<option value="${valorData}">${dataFormatada} (${diaSemanaCurto})</option>`;
            dataSelect.innerHTML += option;

            let classSelected = diasGerados === 0 ? 'selected' : '';
            let cardHtml = `
                <div class="date-card ${classSelected}" data-valor="${valorData}">
                    <div class="day-name">${diaSemanaCurto}</div>
                    <div class="day-num">${diaNumero}</div>
                </div>
            `;
            dateCardsContainer.innerHTML += cardHtml;
            diasGerados++;
        }
        diasAvancados++;
    }

    dataSelect.selectedIndex = 0;
    horaSelecionada = null;
    atualizarTabela();
}

function selecionarDataVisual(valorData, elemento) {
    document.querySelectorAll('.date-card').forEach(card => card.classList.remove('selected'));
    elemento.classList.add('selected');
    document.getElementById('dataSelect').value = valorData;
    horaSelecionada = null;
    atualizarTabela();
}

function selecionarServico(slots, nome, elemento) {
    servicoDuracaoSlots = slots;
    servicoSelecionadoNome = nome;
    document.querySelectorAll('.service-card').forEach(card => card.classList.remove('selected'));
    elemento.classList.add('selected');
    horaSelecionada = null;
    atualizarTabela();
}

function atualizarTabela() {
    const data = document.getElementById('dataSelect').value;
    if (!data) return;
    horaSelecionada = null;
    if (ouvinteFirebase) ouvinteFirebase();

    ouvinteFirebase = onSnapshot(doc(db, "agendamentos", data), (docSnap) => {
        dadosDoDiaAtual = docSnap.exists() ? docSnap.data() : {};
        renderizarGradeHtml();
    });
}

function renderizarGradeHtml() {
    const container = document.getElementById('scheduleTable');
    container.innerHTML = '';

    horariosFicha.forEach((hora, index) => {
        const div = document.createElement('div');
        div.textContent = hora;
        div.className = 'time-slot';

        let status = dadosDoDiaAtual[hora] ? dadosDoDiaAtual[hora].tipo : 'livre';

        if (status === 'livre' && servicoDuracaoSlots > 1) {
            if (index + servicoDuracaoSlots > horariosFicha.length) {
                status = 'ocupado';
            } else {
                let todosLivres = true;
                for (let i = 1; i < servicoDuracaoSlots; i++) {
                    let proxHora = horariosFicha[index + i];
                    if (!proxHora) { todosLivres = false; break; }
                    let proxStatus = dadosDoDiaAtual[proxHora] ? dadosDoDiaAtual[proxHora].tipo : 'livre';
                    if (proxStatus !== 'livre') { todosLivres = false; break; }
                }
                if (!todosLivres) status = 'ocupado';
            }
        }

        if (status === 'agendamento') {
            div.classList.add('taken');
        } else if (status === 'bloqueado') {
            div.classList.add('blocked');
        } else {
            div.classList.add('free');
            div.addEventListener('click', () => {
                document.querySelectorAll('.time-slot').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                horaSelecionada = hora;
            });
        }

        container.appendChild(div);
    });
}

async function confirmarAgendamento() {
    const nome = sanitizarTexto(document.getElementById('clienteNome').value);
    let telBruto = document.getElementById('clienteNumero').value;
    const data = document.getElementById('dataSelect').value;

    if (!data) { alert("Selecione uma data."); return; }
    if (!nome || !telBruto || !horaSelecionada) { alert("Preencha nome, telefone e escolha um horário."); return; }
    if (!validarTelefone(telBruto)) { alert("Telefone inválido. Use DDD + número (10 ou 11 dígitos)."); return; }

    const telLimpo = telBruto.replace(/\D/g, '');
    let prosseguir = true;

    try {
        const clienteRef = doc(db, "clientes", telLimpo);
        const clienteSnap = await getDoc(clienteRef);

        if (clienteSnap.exists()) {
            const dadosCliente = clienteSnap.data();
            const historico = dadosCliente.servicos || {};
            const dataUltimoServico = historico[servicoSelecionadoNome];

            if (dataUltimoServico === data) {
                alert(`Você já agendou "${servicoSelecionadoNome}" para este dia.`);
                prosseguir = false;
            } else if (dataUltimoServico) {
                const [d1, m1, y1] = dataUltimoServico.split('-');
                const dataAntiga = new Date(y1, m1 - 1, d1);
                const [d2, m2, y2] = data.split('-');
                const dataNova = new Date(y2, m2 - 1, d2);
                const diferencaEmDias = Math.ceil(Math.abs(dataNova - dataAntiga) / (1000 * 60 * 60 * 24));

                if (diferencaEmDias < 7) {
                    alert(`Você só pode agendar "${servicoSelecionadoNome}" após 7 dias.`);
                    prosseguir = false;
                }
            }
        }
    } catch (e) {
        console.error("Erro ao validar cliente:", e);
    }

    if (!prosseguir) return;

    let dadosParaSalvar = {
        [horaSelecionada]: {
            tipo: 'agendamento',
            nome: nome,
            tel: telLimpo,
            servico: servicoSelecionadoNome
        }
    };

    if (servicoDuracaoSlots > 1) {
        let startIndex = horariosFicha.indexOf(horaSelecionada);
        for (let i = 1; i < servicoDuracaoSlots; i++) {
            let proxHora = horariosFicha[startIndex + i];
            if (!proxHora) break;
            dadosParaSalvar[proxHora] = {
                tipo: 'agendamento',
                nome: nome,
                tel: telLimpo + ' (Cont.)',
                servico: servicoSelecionadoNome
            };
        }
    }

    try {
        await setDoc(doc(db, "agendamentos", data), dadosParaSalvar, { merge: true });

        await setDoc(doc(db, "clientes", telLimpo), {
            servicos: { [servicoSelecionadoNome]: data },
            ativo: true
        }, { merge: true });

        try {
            const res = await fetch('/api/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': WHATSAPP_API_KEY },
                body: JSON.stringify({ telefone: telLimpo, nome: nome, data: data.replaceAll('-', '/'), hora: horaSelecionada, servico: servicoSelecionadoNome })
            });
            const respostaApi = await res.json();
            if (!res.ok) console.error("Erro real da API:", respostaApi);
            else console.log("WhatsApp enviado:", respostaApi);
        } catch (errApi) {
            console.error("Erro na API de WhatsApp:", errApi);
        }

        document.getElementById('booking-area').classList.add('hidden');
        document.getElementById('success-area').classList.remove('hidden');
        document.getElementById('resumoAgendamento').innerText =
            `${nome}, seu horário foi confirmado para ${data.replaceAll('-', '/')} às ${horaSelecionada}!\nServiço: ${servicoSelecionadoNome}`;
    } catch (e) {
        console.error("Erro ao salvar agendamento:", e);
        alert("Erro de conexão ao agendar. Tente novamente.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    inicializar();
    configurarValidacaoDeCampos();

    document.getElementById('dateCardsContainer').addEventListener('click', (e) => {
        const card = e.target.closest('.date-card');
        if (card) {
            selecionarDataVisual(card.dataset.valor, card);
        }
    });

    document.querySelectorAll('.service-card').forEach(card => {
        card.addEventListener('click', function () {
            const slots = parseInt(this.dataset.slots);
            const nome = this.dataset.nome;
            selecionarServico(slots, nome, this);
        });
    });

    document.getElementById('btnReservar').addEventListener('click', confirmarAgendamento);
    document.getElementById('btnNovoAgendamento').addEventListener('click', () => location.reload());
});
