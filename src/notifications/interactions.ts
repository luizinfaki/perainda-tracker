import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, Interaction } from "discord.js";
import { prisma } from "../db/client";
import { buildMatchView, isMatchView } from "./formatMessage";
import { buildLeaderboard, CHALLENGE_START } from "../jobs/leaderboard";
import { buildLeaderboardEmbed } from "./leaderboard";

export async function handleInteraction(interaction: Interaction): Promise<void> {
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
