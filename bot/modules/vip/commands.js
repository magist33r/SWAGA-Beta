function createVipCommands({ SlashCommandBuilder, PermissionFlagsBits, vipRoles }) {
  const roles = vipRoles instanceof Map ? vipRoles : new Map();

  const VIPLIST_COMMAND = new SlashCommandBuilder()
    .setName('viplist')
    .setDescription('List active VIP')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addIntegerOption((option) =>
      option.setName('page').setDescription('Page number').setMinValue(1)
    );

  const SETVIP_COMMAND = new SlashCommandBuilder()
    .setName('setvip')
    .setDescription('Set VIP expiration')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option.setName('user').setDescription('Target user').setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('days')
        .setDescription('Days until expiration; 0 = forever')
        .setRequired(true)
        .setMinValue(0)
    )
    .addStringOption((option) => {
      option.setName('role').setDescription('VIP role (optional)').setRequired(false);
      for (const roleName of roles.keys()) {
        option.addChoices({ name: roleName, value: roleName });
      }
      return option;
    });

  const STATS_COMMAND = new SlashCommandBuilder()
    .setName('vipstats')
    .setDescription('VIP stats')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

  const REMOVEVIP_COMMAND = new SlashCommandBuilder()
    .setName('removevip')
    .setDescription('Remove VIP from user')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option.setName('user').setDescription('Target user').setRequired(true)
    );

  const GIVEVIP_COMMAND = new SlashCommandBuilder()
    .setName('givevip')
    .setDescription('Give VIP role')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option.setName('user').setDescription('Target user').setRequired(true)
    )
    .addStringOption((option) => {
      option.setName('tariff').setDescription('VIP tariff').setRequired(true);
      for (const roleName of roles.keys()) {
        option.addChoices({ name: roleName, value: roleName });
      }
      return option;
    });

  const PROFILE_COMMAND = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your VIP profile')
    .setDMPermission(true);

  const SERVERINFO_COMMAND = new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show server VIP statistics')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  return {
    VIPLIST_COMMAND,
    SETVIP_COMMAND,
    STATS_COMMAND,
    REMOVEVIP_COMMAND,
    GIVEVIP_COMMAND,
    PROFILE_COMMAND,
    SERVERINFO_COMMAND,
  };
}

module.exports = {
  createVipCommands,
};
