const { ContainerBuilder, SeparatorSpacingSize, MessageFlags } = require("discord.js");

// Discord's classic message content/embeds can't be spaced or sized on
// purpose - everything is packed tight with no control. Components V2
// (ContainerBuilder + TextDisplay + Separator) gives real, guaranteed gaps
// between blocks and a colored accent bar, at the cost of content/embeds
// being unusable on the same message (Discord requires the IsComponentsV2
// flag and rejects `content`/`embeds` alongside it).

const COLORS = {
  BRAND: 0x5865f2,
  SUCCESS: 0x57f287,
  WARNING: 0xfee75c,
  DANGER: 0xed4245,
  NEUTRAL: 0x99aab5,
};

// Splits on blank lines (as produced by the i18n catalogs) so each
// paragraph becomes its own text block, separated by a real Separator
// component instead of a fragile markdown line break.
function buildContainer(text, { color, actionRows = [] } = {}) {
  const container = new ContainerBuilder();
  if (color !== undefined) container.setAccentColor(color);

  const blocks = text.split(/\n{2,}/);
  blocks.forEach((block, index) => {
    if (index > 0) {
      container.addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small));
    }
    container.addTextDisplayComponents((td) => td.setContent(block));
  });

  if (actionRows.length) {
    container.addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small));
    for (const row of actionRows) {
      container.addActionRowComponents(row);
    }
  }

  return container;
}

function styled(text, { color, actionRows = [], ephemeral = false } = {}) {
  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) flags |= MessageFlags.Ephemeral;

  return {
    flags,
    components: [buildContainer(text, { color, actionRows })],
  };
}

module.exports = { styled, COLORS };
