import http from 'http';
import express, { Response, Request } from 'express';
import socket from 'socket.io';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
const server = new http.Server(app);
const io = socket(server, {
    pingTimeout: 1000,
});

interface ConnectedPlayer {
    id: string;
    name: string;
    /**
     * Número de vezes que jogou
     */
    played_times: number;
    /**
     * Data de quando se conectou na partida
     */
    sign_in_date: any;
}

// Define se o jogo começou ou não
let game_started = false;

// Jogadores conectados na partida
let connectedPlayers: ConnectedPlayer[] = [];

// Jogador que está jogando na rodada atual
let round_player: ConnectedPlayer | null = null;

io.on('connection', function (socket: socket.Socket) {
    console.log("new connection", socket.id, socket.handshake.query.name);

    connectedPlayers.push({
        id: socket.id,
        name: socket.handshake.query.name,
        played_times: 0,
        sign_in_date: new Date()
    });

    const player = connectedPlayers.find(player => player.id == socket.id)

    console.log(`Número de jogadores conectados: ${connectedPlayers.length}`);

    socket.on('disconnect', () => {
        console.log(">>>> disconnection", socket.id);

        connectedPlayers = connectedPlayers.filter(player => player.id != socket.id);

        console.log(`Número de jogadores conectados: ${connectedPlayers.length}`);

        // Envia parar todos os jogadores, menos pro player que se desconectou, quem se desconectou
        socket.broadcast.emit("player_disconnect", player);

        // Verifica se não tem mais nenhum jogador no servidor
        if (connectedPlayers.length == 0) {
            // Não tem mais nenhum jogador no servidor, reseta o jogo
            resetGame();
        }
    })

    // Envia para o jogador algumas informações do jogo
    socket.emit("game_info", {
        player_id: player?.id,
        connected_players: connectedPlayers,
        game_started
    })

    // Envia pro jogador que se conectou todos que estão na partida
    // socket.emit("connected_players", connectedPlayers);

    // Envia parar todos os jogadores, menos pro novo player conectado, quem se conectou
    socket.broadcast.emit("player_connect", player);

    // Envia para o jogador que conectou qual é o jogador da rodada atual
    socket.emit("round_player", round_player);

    // Avisa para o jogador que conectou se o jogo começou
    // socket.emit("game_started", game_started);
});

// Inicia o jogo
function startGame() {
    game_started = true;

    io.sockets.emit("game_started", true);

    // Define quem é o próximo jogador da rodada e envia para todos os jogadores conectados
    io.sockets.emit("round_player", nextPlayerRound());
}

// Define qual é o próximo jogador da rodada
function nextPlayerRound() {
    const next_player = connectedPlayers.reduce(function (prev, curr) {
        return prev.played_times < curr.played_times ? prev : curr;
    });

    const index = connectedPlayers.findIndex(player => player.id == next_player.id);
    connectedPlayers[index].played_times += 1;

    round_player = next_player;

    return next_player;
}

// Reseta o jogo
function resetGame() {
    game_started = false;
    round_player = null;

    io.sockets.emit("round_player", null);
    io.sockets.emit("game_started", false);
    io.sockets.emit("selected_challenge", null);
}

app.use(cors());
app.use(bodyParser.json())

app.get(`/gameinfo`, (req: Request, res: Response) => {
    res.json({ game_started });
})

app.post(`/startgame`, (req: Request, res: Response) => {
    startGame();
})

app.post(`/resetgame`, (req: Request, res: Response) => {
    resetGame();
})

app.post(`/selectchallenge`, (req: Request, res: Response) => {
    const { title, description } = req.body;
    io.sockets.emit("selected_challenge", {
        title,
        description
    })
})

app.post(`/challengeconcluded`, (req: Request, res: Response) => {
    io.sockets.emit("selected_challenge", null);

    // Define quem é o próximo jogador da rodada e envia para todos os jogadores conectados
    io.sockets.emit("round_player", nextPlayerRound());
})

server.listen(3333, function () {
    console.log('Server is running in http://localhost:3333');
});