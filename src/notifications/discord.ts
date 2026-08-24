import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, Message } from "discord.js";
import { getNotificationChannel } from "./discordBot";

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  author?: { name: string; icon_url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordFile {
  name: string;
  data: Buffer;
  contentType?: string;
}

export interface DiscordButtonSpec {
  customId: string;
  label: string;
  style?: "Primary" | "Secondary";
}

function buildComponents(buttons?: DiscordButtonSpec[]) {
  if (!buttons || buttons.length === 0) return [];

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    buttons.map((button) =>
      new ButtonBuilder()
        .setCustomId(button.customId)
        .setLabel(button.label)
        .setStyle(button.style === "Secondary" ? ButtonStyle.Secondary : ButtonStyle.Primary)
    )
  );

  return [row];
}

function buildAttachments(files?: DiscordFile[]): AttachmentBuilder[] {
  return (files ?? []).map((file) => new AttachmentBuilder(file.data, { name: file.name }));
}

export interface SendCardOptions {
  files?: DiscordFile[];
  buttons?: DiscordButtonSpec[];
}

export async function sendCard(embed: DiscordEmbed, options?: SendCardOptions): Promise<Message> {
  const channel = await getNotificationChannel();
  return channel.send({
    embeds: [embed],
    files: buildAttachments(options?.files),
    components: buildComponents(options?.buttons),
  });
}

export interface CardWithOptions {
  embed: DiscordEmbed;
  files?: DiscordFile[];
  buttons?: DiscordButtonSpec[];
}

export async function sendCards(cards: CardWithOptions[], content?: string): Promise<void> {
  const channel = await getNotificationChannel();

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    await channel.send({
      content: i === 0 ? content : undefined,
      embeds: [card.embed],
      files: buildAttachments(card.files),
      components: buildComponents(card.buttons),
    });
  }
}
