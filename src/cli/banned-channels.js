import Server from '../server';

export async function handleBanChannel({ name, externalReason, internalReason }) {
    await Server.getServer().bannedChannelsController.banChannel({
        name,
        externalReason,
        internalReason,
        bannedBy: '[console]'
    });

    return { status: 'success' };
}
