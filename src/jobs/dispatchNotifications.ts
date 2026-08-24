import { prisma } from "../db/client";
import { sendCard, sendCards } from "../notifications/discord";
import { buildEventEmbed } from "../notifications/formatMessage";

export async function dispatchRealtimeNotifications(): Promise<void> {
  const events = await prisma.notificationEvent.findMany({
    where: { status: "PENDING", player: { notifyMode: "REALTIME" } },
    include: { player: true },
    orderBy: { createdAt: "asc" },
  });

  for (const event of events) {
    // Reivindica o evento antes de enviar (condicionado a ainda estar PENDING) pra evitar que
    // dois processos rodando o dispatch ao mesmo tempo mandem a mesma notificação duas vezes.
    const claim = await prisma.notificationEvent.updateMany({
      where: { id: event.id, status: "PENDING" },
      data: { status: "SENT", sentAt: new Date() },
    });
    if (claim.count === 0) continue; // outro processo já pegou esse evento

    try {
      const { embed, files, buttons } = await buildEventEmbed(event.player.riotId, event);
      await sendCard(embed, { files, buttons });
      console.log(`[dispatch] Notificação (${event.type}) enviada p/ ${event.player.riotId}.`);
    } catch (err) {
      console.error(`[dispatch] Erro ao enviar notificação ${event.id}:`, err);
      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: { status: "PENDING", sentAt: null },
      });
    }
  }
}

export async function dispatchDailySummaries(): Promise<void> {
  const players = await prisma.player.findMany({ where: { notifyMode: "DAILY_SUMMARY" } });

  for (const player of players) {
    const events = await prisma.notificationEvent.findMany({
      where: { status: "PENDING", playerId: player.id },
      orderBy: { createdAt: "asc" },
    });

    if (events.length === 0) continue;

    const eventIds = events.map((event) => event.id);
    const claim = await prisma.notificationEvent.updateMany({
      where: { id: { in: eventIds }, status: "PENDING" },
      data: { status: "SENT", sentAt: new Date() },
    });
    if (claim.count !== events.length) {
      console.log(`[dispatch] Resumo diário de ${player.riotId}: outro processo já reivindicou parte dos eventos — pulando esse ciclo.`);
      continue;
    }

    const cards = await Promise.all(events.map((event, index) => buildEventEmbed(player.riotId, event, index)));

    try {
      await sendCards(cards, `**Resumo do dia — ${player.riotId}**`);
      console.log(`[dispatch] Resumo diário enviado p/ ${player.riotId} (${events.length} evento(s)).`);
    } catch (err) {
      console.error(`[dispatch] Erro ao enviar resumo diário p/ ${player.riotId}:`, err);
      await prisma.notificationEvent.updateMany({
        where: { id: { in: eventIds } },
        data: { status: "PENDING", sentAt: null },
      });
    }
  }
}
