import {
  ApplicationCommandOptionType,
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
  TextChannel,
} from "discord.js";

let client: Client | null = null;
let readyPromise: Promise<void> | null = null;

function getClient(): Client {
  if (client) return client;

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN não configurado no .env");
  }

  client = new Client({ intents: [GatewayIntentBits.Guilds] });

  readyPromise = new Promise((resolve) => {
    client!.once(Events.ClientReady, (readyClient) => {
      console.log(`[discord-bot] Conectado como ${readyClient.user.tag}.`);
      resolve();
    });
  });

  client.login(token);
  return client;
}

export async function ensureBotReady(): Promise<void> {
  getClient();
  await readyPromise;
}

export async function getNotificationChannel(): Promise<TextChannel> {
  await ensureBotReady();

  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId) {
    throw new Error("DISCORD_CHANNEL_ID não configurado no .env");
  }

  const channel = await getClient().channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    throw new Error(`Canal ${channelId} não encontrado ou não é um canal de texto de servidor.`);
  }

  return channel as TextChannel;
}

export function onInteraction(handler: (interaction: Interaction) => void | Promise<void>): void {
  getClient().on(Events.InteractionCreate, handler);
}

export async function registerSlashCommands(): Promise<void> {
  const channel = await getNotificationChannel();

  await getClient().application?.commands.create(
    { name: "rank", description: "Mostra o leaderboard de rank atual do grupo" },
    channel.guildId
  );

  await getClient().application?.commands.create(
    {
      name: "historico",
      description: "Gráfico de elo ao longo do tempo",
      options: [
        {
          name: "periodo",
          description: "Como agrupar no tempo (padrão: semanal)",
          type: ApplicationCommandOptionType.String,
          choices: [
            { name: "diário", value: "daily" },
            { name: "semanal", value: "weekly" },
            { name: "mensal", value: "monthly" },
          ],
        },
        {
          name: "player",
          description: "Riot ID de um player específico (vazio = todos sobrepostos)",
          type: ApplicationCommandOptionType.String,
        },
      ],
    },
    channel.guildId
  );

  await getClient().application?.commands.create(
    {
      name: "resumo",
      description: "Resumo estilo op.gg desde o início do desafio",
      options: [
        {
          name: "player",
          description: "Riot ID de um player específico (vazio = resumo do grupo)",
          type: ApplicationCommandOptionType.String,
        },
      ],
    },
    channel.guildId
  );

  console.log("[discord-bot] Slash commands /rank, /historico e /resumo registrados.");
}
