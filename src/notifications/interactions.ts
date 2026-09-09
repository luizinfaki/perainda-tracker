import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Interaction,
} from "discord.js";
import { prisma } from "../db/client";
import { buildMatchView, isMatchView } from "./formatMessage";
import { buildLeaderboard, CHALLENGE_START } from "../jobs/leaderboard";
import { buildLeaderboardEmbed } from "./leaderboard";
import { buildRankHistory, Granularity, GRANULARITY_PT } from "../jobs/rankHistory";
import { renderRankHistoryPng } from "./rankChart";

const ALL_PLAYERS_ALIASES = new Set(["todos", "todas", "all", "grupo"]);

async function handleHistorico(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const periodo = (interaction.options.getString("periodo") ?? "weekly") as Granularity;

  const rawPlayer = interaction.options.getString("player")?.trim();
  let playerIds: string[] | undefined;
  let scopeLabel = "grupo";

  if (rawPlayer && !ALL_PLAYERS_ALIASES.has(rawPlayer.toLowerCase())) {
    const name = rawPlayer.split("#")[0].trim();
    const player = await prisma.player.findFirst({
      where: { riotId: { equals: name, mode: "insensitive" } },
    });
    if (!player) {
      await interaction.editReply(`Não achei nenhum player com o Riot ID "${rawPlayer}".`);
      return;
    }
    playerIds = [player.id];
    scopeLabel = player.riotId;
  }

  const histories = await buildRankHistory(periodo, { playerIds });
  if (histories.every((h) => h.points.length === 0)) {
    await interaction.editReply("Ainda não tem histórico de rank suficiente pra montar o gráfico.");
    return;
  }

  const png = renderRankHistoryPng(histories, periodo);
  await interaction.editReply({
    embeds: [
      {
        title: `📊 Histórico de rank (${GRANULARITY_PT[periodo]}) — ${scopeLabel}`,
        color: 0x5cd85c,
        image: { url: "attachment://historico.png" },
        footer: { text: "Perainda Tracker" },
      },
    ],
    files: [new AttachmentBuilder(png, { name: "historico.png" })],
  });
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand() && interaction.commandName === "historico") {
    await handleHistorico(interaction);
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "rank") {
    await interaction.deferReply();
    const entries = await buildLeaderboard();
    if (entries.length === 0) {
      await interaction.editReply("Nenhum player ranqueado ainda.");
      return;
    }
    await interaction.editReply({ embeds: [buildLeaderboardEmbed(entries, CHALLENGE_START)] });
    return;
  }

  if (!interaction.isButton()) return;

  const [scope, view, eventId] = interaction.customId.split(":");
  if (scope !== "match" || !isMatchView(view)) return;

  await interaction.deferUpdate();

  const event = await prisma.notificationEvent.findUnique({
    where: { id: eventId },
    include: { player: true },
  });

  if (!event) {
    await interaction.followUp({
      content: "Notificação não encontrada (pode ter sido removida do banco).",
      ephemeral: true,
    });
    return;
  }

  const result = await buildMatchView(event.player.riotId, event, view);

  const attachments = (result.files ?? []).map((file) => new AttachmentBuilder(file.data, { name: file.name }));
  const components = result.buttons?.length
    ? [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          result.buttons.map((button) =>
            new ButtonBuilder()
              .setCustomId(button.customId)
              .setLabel(button.label)
              .setStyle(button.style === "Secondary" ? ButtonStyle.Secondary : ButtonStyle.Primary)
          )
        ),
      ]
    : [];

  await interaction.editReply({ embeds: [result.embed], files: attachments, components });
}
