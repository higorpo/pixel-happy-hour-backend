export interface ServerConnectedPlayer {
    id: string;
    roomId: string | null;
}

export interface ConnectedPlayer {
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
    /**
     * Cor do usuário
     */
    color: string
}

export interface ServerRoom {
    id: string;
    name: string;
    game_started: boolean;
    round_player: ConnectedPlayer | null;
    players: ConnectedPlayer[];
    challenges: { title: string, description: string }[]
}
