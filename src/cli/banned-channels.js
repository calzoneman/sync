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

export async function handleUnbanChannel({ name }) {
    await Server.getServer().bannedChannelsController.unbanChannel(name, '[console]');

    return { status: 'success' };
}

export async function handleShowBannedChannel({ name }) {
    let banInfo = await Server.getServer().bannedChannelsController.getBannedChannel(name);

    return { status: 'success', ban: banInfo };
}
