import { doc, setDoc, updateDoc, deleteField, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db, horariosFicha } from './firebase.js';

let dadosDoDiaAtual = {};
let ouvinteFirebase = null;

// ==========================================
// LOGIN
// ==========================================
async function fazerLogin(usuario, senha) {
    const erroEl = document.getElementById('loginErro');
    erroEl.textContent = '';

    if (!usuario || !senha) {
        erroEl.textContent = 'Preencha usuário e senha.';
        return;
    }

    try {
        const res = await fetch('/api/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, senha })
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            erroEl.textContent = 'Erro interno do servidor (resposta inválida).';
            return;
        }

        if (!res.ok) {
            erroEl.textContent = data.erro || 'Credenciais inválidas.';
            return;
        }

        document.getElementById('login-area').classList.add('hidden');
        document.getElementById('painel-area').classList.remove('hidden');
        inicializarPainel();
    } catch (err) {
        console.error('Erro real:', err);
        erroEl.textContent = 'Erro de conexão com o servidor.';
    }
}

function sair() {
    document.getElementById('painel-area').classList.add('hidden');
    document.getElementById('login-area').classList.remove('hidden');
    document.getElementById('formLogin').reset();
    if (ouvinteFirebase) ouvinteFirebase();
}

// ==========================================
// PAINEL
// ==========================================
function inicializarPainel() {
    const adminDataSelect = document.getElementById('adminDataSelect');
    adminDataSelect.innerHTML = '';

    const hoje = new Date();
    let diasGerados = 0;
    let diasAvancados = 0;

    while (diasGerados < 15) {
        let d = new Date(hoje);
        d.setDate(hoje.getDate() + diasAvancados);
        let diaSemanaNum = d.getDay();

        if (diaSemanaNum !== 0 && diaSemanaNum !== 1) {
            let dataFormatada = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            let diaSemanaCurto = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').substring(0, 3);
            let valorData = dataFormatada.replaceAll('/', '-');

            adminDataSelect.innerHTML += `<option value="${valorData}">${dataFormatada} (${diaSemanaCurto})</option>`;
            diasGerados++;
        }
        diasAvancados++;
    }

    adminDataSelect.selectedIndex = 0;
    atualizarTabelaAdmin();
}

function mudarDataAdmin() {
    atualizarTabelaAdmin();
}

function atualizarTabelaAdmin() {
    const data = document.getElementById('adminDataSelect').value;
    if (!data) return;
    if (ouvinteFirebase) ouvinteFirebase();

    ouvinteFirebase = onSnapshot(doc(db, "agendamentos", data), (docSnap) => {
        dadosDoDiaAtual = docSnap.exists() ? docSnap.data() : {};
        renderizarListaAdmin();
    });
}

function renderizarListaAdmin() {
    const container = document.getElementById('adminScheduleList');
    const dataAtual = document.getElementById('adminDataSelect').value;
    container.innerHTML = '';

    horariosFicha.forEach(hora => {
        const info = dadosDoDiaAtual[hora];
        const div = document.createElement('div');

        if (!info) {
            div.className = 'admin-item';
            div.innerHTML = `
                <div class="admin-info"><strong>${hora}</strong> <span style="color:var(--text-muted)">Livre</span></div>
                <div class="admin-actions"><button class="btn-warning btn-bloquear" data-hora="${hora}">Bloquear</button></div>
            `;
        } else if (info.tipo === 'bloqueado') {
            div.className = 'admin-item bloqueado';
            div.innerHTML = `
                <div class="admin-info"><strong>${hora}</strong> <span style="color:var(--blocked)">BLOQUEADO</span></div>
                <div class="admin-actions"><button class="btn-success btn-liberar" data-hora="${hora}">Liberar</button></div>
            `;
        } else if (info.tipo === 'agendamento' && !info.tel.includes('(Cont.)')) {
            let telWhats = info.tel.replace(/\D/g, '');
            div.className = 'admin-item ocupado';
            div.innerHTML = `
                <div class="admin-info"><strong>${hora} - ${info.nome}</strong> <span style="color:var(--text-muted)">Serviço: ${info.servico} | Tel: ${info.tel}</span></div>
                <div class="admin-actions">
                    <button class="btn-whatsapp btn-avisar" data-tel="${telWhats}" data-nome="${info.nome}" data-hora="${hora}" data-servico="${info.servico}">📱 Avisar Cliente</button>
                    <button class="btn-danger btn-desmarcar" data-hora="${hora}" data-tel="${info.tel}" data-servico="${info.servico}">Desmarcar</button>
                </div>
            `;
        } else if (info.tipo === 'agendamento') {
            div.className = 'admin-item ocupado';
            div.innerHTML = `
                <div class="admin-info"><strong>${hora} - ${info.nome}</strong> <span style="color:var(--text-muted)">Continuação de serviço</span></div>
                <div class="admin-actions"><button class="btn-danger btn-desmarcar" data-hora="${hora}" data-tel="${info.tel}">Desmarcar</button></div>
            `;
        }
        container.appendChild(div);
    });

    container.querySelectorAll('.btn-bloquear').forEach(btn => {
        btn.addEventListener('click', () => alterarStatusFirebase(dataAtual, btn.dataset.hora, 'bloquear'));
    });
    container.querySelectorAll('.btn-liberar').forEach(btn => {
        btn.addEventListener('click', () => alterarStatusFirebase(dataAtual, btn.dataset.hora, 'liberar'));
    });
    container.querySelectorAll('.btn-desmarcar').forEach(btn => {
        btn.addEventListener('click', () => {
            const tel = btn.dataset.tel || null;
            const servico = btn.dataset.servico || null;
            alterarStatusFirebase(dataAtual, btn.dataset.hora, 'desmarcar', tel, servico);
        });
    });
    container.querySelectorAll('.btn-avisar').forEach(btn => {
        btn.addEventListener('click', () => {
            enviarConfirmacaoWhats(btn.dataset.tel, btn.dataset.nome, dataAtual, btn.dataset.hora, btn.dataset.servico);
        });
    });
}

function enviarConfirmacaoWhats(telefone, nome, data, hora, servico) {
    if (telefone.length <= 11) telefone = "55" + telefone;
    const dataFormatada = data.replaceAll('-', '/');
    const mensagem = `Olá, ${nome}! Aqui é da Barbearia do Gomes.\n\nEstou passando para confirmar o seu agendamento de *${servico}* no dia *${dataFormatada}* às *${hora}*.\n\nTe esperamos!`;
    window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`, '_blank');
}

// ==========================================
// MODAL DE CONFIRMAÇÃO (substitui o confirm() nativo do navegador)
// ==========================================
function confirmarAcao(mensagem) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('modalConfirm');
        const msgEl = document.getElementById('modalConfirmMsg');
        const btnOk = document.getElementById('modalConfirmOk');
        const btnCancelar = document.getElementById('modalConfirmCancelar');

        msgEl.textContent = mensagem;
        overlay.classList.remove('hidden');

        function limpar(resultado) {
            overlay.classList.add('hidden');
            btnOk.removeEventListener('click', onOk);
            btnCancelar.removeEventListener('click', onCancelar);
            overlay.removeEventListener('click', onOverlayClick);
            resolve(resultado);
        }

        function onOk() { limpar(true); }
        function onCancelar() { limpar(false); }
        function onOverlayClick(e) { if (e.target === overlay) limpar(false); }

        btnOk.addEventListener('click', onOk);
        btnCancelar.addEventListener('click', onCancelar);
        overlay.addEventListener('click', onOverlayClick);
    });
}

async function alterarStatusFirebase(data, hora, acao, telefoneCliente = null, servicoCliente = null) {
    const docRef = doc(db, "agendamentos", data);
    try {
        if (acao === 'bloquear') {
            await setDoc(docRef, { [hora]: { tipo: 'bloqueado' } }, { merge: true });
        }
        else if (acao === 'liberar') {
            await updateDoc(docRef, { [hora]: deleteField() });
        }
        else if (acao === 'desmarcar') {
            const confirmado = await confirmarAcao(`Tem certeza que deseja desmarcar o horário ${hora}?`);
            if (!confirmado) return;

            let updates = { [hora]: deleteField() };

            if (telefoneCliente) {
                let startIndex = horariosFicha.indexOf(hora);

                for (let i = 1; i < 4; i++) {
                    let proxHora = horariosFicha[startIndex + i];
                    if (!proxHora) break;

                    if (dadosDoDiaAtual[proxHora]) {
                        let proxInfo = dadosDoDiaAtual[proxHora];

                        if (proxInfo.tipo === 'agendamento' &&
                            proxInfo.tel === telefoneCliente + ' (Cont.)') {
                            updates[proxHora] = deleteField();
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }

            await updateDoc(docRef, updates);

            if (telefoneCliente) {
                let telLimpo = telefoneCliente.replace(' (Cont.)', '').replace(/\D/g, '');

                if (telLimpo.length >= 10) {
                    try {
                        const clienteRef = doc(db, "clientes", telLimpo);
                        const clienteSnap = await getDoc(clienteRef);

                        if (clienteSnap.exists()) {
                            const dadosCliente = clienteSnap.data();

                            if (dadosCliente.servicos && servicoCliente) {
                                await updateDoc(clienteRef, {
                                    [`servicos.${servicoCliente}`]: deleteField(),
                                    ativo: false
                                });
                            }
                            else if (dadosCliente.servicos) {
                                const updatesCliente = {};
                                Object.keys(dadosCliente.servicos).forEach(serv => {
                                    updatesCliente[`servicos.${serv}`] = deleteField();
                                });
                                updatesCliente.ativo = false;
                                await updateDoc(clienteRef, updatesCliente);
                            }
                            else {
                                await setDoc(clienteRef, { ativo: false }, { merge: true });
                            }
                        }
                    } catch (erro) {
                        console.error("Erro ao atualizar cliente:", erro);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Erro ao alterar status:", e);
        alert("Erro ao modificar horário. Tente novamente.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('formLogin').addEventListener('submit', (e) => {
        e.preventDefault();
        const usuario = document.getElementById('loginUsuario').value.trim();
        const senha = document.getElementById('loginSenha').value;
        fazerLogin(usuario, senha);
    });

    document.getElementById('btnSair').addEventListener('click', sair);
    document.getElementById('adminDataSelect').addEventListener('change', mudarDataAdmin);
});