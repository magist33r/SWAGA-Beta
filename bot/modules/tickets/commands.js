function createTicketCommands({ SlashCommandBuilder, PermissionFlagsBits }) {
  const TICKETPANEL_COMMAND = new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Post ticket panel in current channel')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

  const CLOSE_TICKET_COMMAND = new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close current ticket')
    .setDMPermission(false);

  const DELETE_TICKET_COMMAND = new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete current ticket')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const PAYMENT_COMMAND = new SlashCommandBuilder()
    .setName('payment')
    .setDescription('Показать реквизиты для оплаты')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  return {
    TICKETPANEL_COMMAND,
    CLOSE_TICKET_COMMAND,
    DELETE_TICKET_COMMAND,
    PAYMENT_COMMAND,
  };
}

module.exports = {
  createTicketCommands,
};
