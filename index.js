
import { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Collection, 
  REST, 
  Routes, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  Events,
  SlashCommandBuilder
} from 'discord.js';
import fs from 'fs';
import './keepalive.js';
import 'dotenv/config';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

let db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
if (!db.itemShop) db.itemShop = [];
if (!db.allItems) db.allItems = [];
if (!db.roleShop) db.roleShop = [];
if (!db.users) db.users = {};

function saveDB() {
  fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));
}

function rotateShop() {
  const shuffled = db.allItems.sort(() => 0.5 - Math.random());
  db.itemShop = shuffled.slice(0, 5);
  saveDB();
}

function getPassiveValue(user, keyword) {
  const effects = user.passiveEffects || [];
  let total = 0;
  for (const effect of effects) {
    if (effect.startsWith(keyword)) {
      const value = parseInt(effect.split(' ')[1]);
      if (!isNaN(value)) total += value;
    }
  }
  return total;
}

const spookyJobs = [
  { name: "Grave Digger", difficulty: "Easy", reward: 75 },
  { name: "Ghost Hunter", difficulty: "Medium", reward: 125 },
  { name: "Necromancer", difficulty: "Hard", reward: 200 },
  { name: "Haunted Librarian", difficulty: "Easy", reward: 80 },
  { name: "Spirit Medium", difficulty: "Medium", reward: 150 },
  { name: "Crypt Keeper", difficulty: "Hard", reward: 180 },
  { name: "Exorcist", difficulty: "Very Hard", reward: 250 },
  { name: "Dollmaker", difficulty: "Hard", reward: 190 },
  { name: "Occult Investigator", difficulty: "Very Hard", reward: 230 }
];

const commands = [
  new SlashCommandBuilder().setName('tokens').setDescription('Check your Soul Token balance'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim daily Soul Tokens'),
  new SlashCommandBuilder().setName('haunt').setDescription('Attempt to haunt a place for Soul Tokens'),
  new SlashCommandBuilder().setName('tarot').setDescription('Draw a tarot card for a mysterious reward'),
  new SlashCommandBuilder().setName('slots').setDescription('Spin the cursed slot machine'),
  new SlashCommandBuilder().setName('maze').setDescription('Navigate a haunted maze'),
  new SlashCommandBuilder().setName('duel')
    .setDescription('Challenge another user for Soul Tokens')
    .addUserOption(opt => opt.setName('target').setDescription('The user you want to duel').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('The amount of tokens to duel for').setRequired(true)),
  new SlashCommandBuilder().setName('donate')
    .setDescription('Donate Soul Tokens to another user')
    .addUserOption(opt => opt.setName('target').setDescription('The user to donate to').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of tokens').setRequired(true)),
  new SlashCommandBuilder().setName('shop').setDescription('Browse the rotating item shop'),
  new SlashCommandBuilder().setName('use')
    .setDescription('Use an item from your inventory')
    .addStringOption(opt => opt.setName('item').setDescription('The item name').setRequired(true)),
  new SlashCommandBuilder().setName('inventory').setDescription('View your item inventory'),
  new SlashCommandBuilder().setName('jobs').setDescription('Choose or view spooky jobs'),
  new SlashCommandBuilder().setName('work').setDescription('Perform your current job'),
  new SlashCommandBuilder().setName('resign').setDescription('Resign from your current job'),
  new SlashCommandBuilder().setName('streak').setDescription('Check your daily reward streak'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('See the top 5 richest users'),
  new SlashCommandBuilder().setName('tokenhelp').setDescription('View all Soul Token commands'),
  new SlashCommandBuilder().setName('rotate').setDescription('Admin only: rotate the shop')
];

const rest = new REST({ version: '10' }).setToken(process.env.YOUR_BOT_TOKEN);

(async () => {
  try {
    console.log('Refreshing application (/) commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

client.once('ready', () => {
  console.log(`🧟 Logged in as ${client.user.tag}`);
  rotateShop();
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_job') {
      const userId = interaction.user.id;
      const jobName = interaction.values[0];
      
      if (!db.users[userId]) db.users[userId] = {
        balance: 0,
        inventory: [],
        streak: 0,
        bestStreak: 0,
        passiveEffects: [],
        job: null,
        jobSince: null
      };
      
      db.users[userId].job = jobName;
      db.users[userId].jobSince = Date.now();
      saveDB();
      
      await interaction.reply({ 
        content: `You are now working as a ${jobName}! Use \`/work\` to earn Soul Tokens.`,
        ephemeral: true 
      });
    }
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('buy_')) {
      const itemName = interaction.customId.replace('buy_', '');
      const userId = interaction.user.id;
      
      if (!db.users[userId]) db.users[userId] = {
        balance: 0,
        inventory: [],
        streak: 0,
        bestStreak: 0,
        passiveEffects: [],
        job: null,
        jobSince: null
      };
      
      const userData = db.users[userId];
      const item = db.itemShop.find(i => i.name === itemName);
      
      if (!item) {
        return interaction.reply({ content: 'Item not found in shop.', ephemeral: true });
      }
      
      if (userData.balance < item.price) {
        return interaction.reply({ content: 'You don\'t have enough Soul Tokens.', ephemeral: true });
      }
      
      userData.balance -= item.price;
      userData.inventory.push(item.name);
      saveDB();
      
      await interaction.reply({
        content: `You purchased ${item.name} for ${item.price} Soul Tokens!`,
        ephemeral: true
      });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, options } = interaction;
  const userId = user.id;
  
  if (!db.users[userId]) {
    db.users[userId] = {
      balance: 0,
      inventory: [],
      streak: 0,
      bestStreak: 0,
      passiveEffects: [],
      job: null,
      jobSince: null
    };
  }
  
  const userData = db.users[userId];

  function replyPrivate(content) {
    return interaction.reply({ content, ephemeral: true });
  }

  function replyPublic(content) {
    return interaction.reply({ content });
  }

  // Auto-expire job after 24 hours
  const jobTimeout = 24 * 60 * 60 * 1000;
  if (userData.job && userData.jobSince && Date.now() - userData.jobSince >= jobTimeout) {
    userData.job = null;
    userData.jobSince = null;
    saveDB();
  }

  if (commandName === 'tokens') {
    return replyPublic(`You have ${userData.balance} Soul Tokens.`);
  }

  if (commandName === 'daily') {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const twoDays = 2 * oneDay;

    if (!userData.lastDaily || now - userData.lastDaily >= twoDays) {
      userData.streak = 1;
    } else if (now - userData.lastDaily >= oneDay) {
      userData.streak += 1;
    } else {
      const next = new Date(userData.lastDaily + oneDay);
      return replyPublic(`Already claimed. Come back <t:${Math.floor(next / 1000)}:R>.`);
    }

    if (userData.streak > userData.bestStreak) userData.bestStreak = userData.streak;
    const bonus = userData.streak * 10;
    const percentBoost = getPassiveValue(userData, 'bonus');
    const reward = Math.floor((100 + bonus) * (1 + percentBoost / 100));

    userData.balance += reward;
    userData.lastDaily = now;
    saveDB();

    return replyPublic(`Daily claimed! ${reward} Soul Tokens (Streak: ${userData.streak}, Bonus: ${percentBoost}%).`);
  }

  if (commandName === 'streak') {
    return replyPublic(`Current streak: ${userData.streak || 0} days\nBest streak: ${userData.bestStreak || 0} days`);
  }

  if (commandName === 'haunt') {
    const now = Date.now();
    const cooldown = 8 * 60 * 60 * 1000;

    if (userData.lastHaunt && now - userData.lastHaunt < cooldown) {
      const next = new Date(userData.lastHaunt + cooldown);
      return replyPublic(`You must wait before haunting again. Come back <t:${Math.floor(next / 1000)}:R>.`);
    }

    const result = Math.random();
    const amount = Math.floor(Math.random() * 75) + 25;
    const lucky = getPassiveValue(userData, 'lucky');
    const protect = getPassiveValue(userData, 'protect');
    const isLucky = Math.random() * 100 < lucky;
    const isProtected = Math.random() * 100 < protect;

    if (result < 0.6 || isLucky) {
      const gain = isLucky ? amount * 2 : amount;
      userData.balance += gain;
      await replyPublic(`You haunted a place and found ${gain} Soul Tokens${isLucky ? ' (LUCKY!)' : ''}.`);
    } else {
      const loss = Math.min(userData.balance, amount);
      if (isProtected) {
        await replyPublic(`A spirit tried to drain you, but your charm protected you! You lost nothing.`);
      } else {
        userData.balance -= loss;
        await replyPublic(`You were caught by a spirit and lost ${loss} Soul Tokens.`);
      }
    }

    userData.lastHaunt = now;
    saveDB();
  }

  if (commandName === 'tarot') {
    const now = Date.now();
    const cooldown = 12 * 60 * 60 * 1000;

    if (userData.lastTarot && now - userData.lastTarot < cooldown) {
      const next = new Date(userData.lastTarot + cooldown);
      return replyPublic(`You already drew a card. Come back <t:${Math.floor(next / 1000)}:R>.`);
    }

    const cards = [
      { name: 'The Fool', desc: 'A new journey begins. Embrace chaos.' },
      { name: 'The Devil', desc: 'Temptation rises. Risk meets reward.' },
      { name: 'Death', desc: 'Transformation. What ends gives way to power.' },
      { name: 'The Lovers', desc: 'Fate is tied. Allies may be near.' },
      { name: 'The Tower', desc: 'Collapse breeds awakening. Beware.' }
    ];

    const drawn = cards[Math.floor(Math.random() * cards.length)];
    const reward = Math.floor(Math.random() * 200) + 50;
    userData.balance += reward;
    userData.lastTarot = now;
    saveDB();

    return replyPublic(`You drew **${drawn.name}** — *${drawn.desc}* — and gained ${reward} Soul Tokens!`);
  }

  if (commandName === 'slots') {
    const now = Date.now();
    const cooldown = 2 * 60 * 60 * 1000;

    if (userData.lastSlots && now - userData.lastSlots < cooldown) {
      const next = new Date(userData.lastSlots + cooldown);
      return replyPublic(`The cursed machine needs time... Try again <t:${Math.floor(next / 1000)}:R>.`);
    }

    const symbols = ['💀', '👻', '🕷️', '🧛', '🩸'];
    const roll = [0, 0, 0].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
    const win = roll.every(symbol => symbol === roll[0]);
    const bet = 50;

    if (userData.balance < bet) return replyPublic('You need at least 50 Soul Tokens to play.');
    userData.balance -= bet;

    if (win) {
      userData.balance += 200;
      await replyPublic(`🎰 ${roll.join(' | ')} 🎰\nJackpot! You win 200 Soul Tokens!`);
    } else {
      await replyPublic(`🎰 ${roll.join(' | ')} 🎰\nBetter luck next time...`);
    }

    userData.lastSlots = now;
    saveDB();
  }

  if (commandName === 'maze') {
    const now = Date.now();
    const cooldown = 1 * 60 * 60 * 1000;
    if (userData.lastMaze && now - userData.lastMaze < cooldown) {
      const next = new Date(userData.lastMaze + cooldown);
      return replyPublic(`The cursed maze shifts... Try again <t:${Math.floor(next / 1000)}:R>.`);
    }
    const outcomes = ['escape', 'curse', 'treasure'];
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];
    let message = '';
    if (result === 'escape') {
      message = 'You barely escaped the shifting maze... no reward this time.';
    } else if (result === 'curse') {
      const loss = Math.min(userData.balance, 50);
      userData.balance -= loss;
      message = `A shadow cursed you! You lost ${loss} Soul Tokens.`;
    } else {
      const gain = Math.floor(Math.random() * 150) + 50;
      userData.balance += gain;
      message = `You discovered hidden treasure in the maze! You gained ${gain} Soul Tokens!`;
    }
    userData.lastMaze = now;
    saveDB();
    return replyPublic(message);
  }

  if (commandName === 'duel') {
    const target = options.getUser('target');
    const amount = options.getInteger('amount');
    if (!db.users[target.id]) db.users[target.id] = {
      balance: 0,
      inventory: [],
      streak: 0,
      bestStreak: 0,
      passiveEffects: [],
      job: null
    };
    if (userData.balance < amount || db.users[target.id].balance < amount) {
      return replyPublic('Both duelers must have enough Soul Tokens.');
    }
    const winner = Math.random() < 0.5 ? user : target;
    const loser = winner.id === user.id ? target : user;
    db.users[winner.id].balance += amount;
    db.users[loser.id].balance -= amount;
    saveDB();
    return replyPublic(`⚔️ ${user.username} challenged ${target.username}!
👑 ${winner.username} won ${amount} Soul Tokens!`);
  }

  if (commandName === 'donate') {
    const target = options.getUser('target');
    const amount = options.getInteger('amount');
    if (!db.users[target.id]) db.users[target.id] = {
      balance: 0,
      inventory: [],
      streak: 0,
      bestStreak: 0,
      passiveEffects: [],
      job: null
    };
    if (userData.balance < amount) return replyPublic('You don\'t have enough Soul Tokens.');
    userData.balance -= amount;
    db.users[target.id].balance += amount;
    saveDB();
    return replyPublic(`You donated ${amount} Soul Tokens to ${target.username}.`);
  }

  if (commandName === 'inventory') {
    const items = userData.inventory;
    if (!items.length) return replyPublic('Your inventory is empty.');
    const lines = items.map(name => {
      const item = db.allItems.find(i => i.name === name);
      return `• ${name}${item ? ` — *${item.effect}*` : ''}`;
    });
    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Inventory`)
      .setColor(0x8B0000)
      .setDescription(lines.join('\n'));
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'leaderboard') {
    const top = Object.entries(db.users)
      .sort((a, b) => b[1].balance - a[1].balance)
      .slice(0, 5);

    let leaderboard = '🏆 **Top 5 Soul Token Hoarders:**\n';

    for (let i = 0; i < top.length; i++) {
      const [id, data] = top[i];
      let userTag;
      try {
        const u = await client.users.fetch(id);
        userTag = u.tag;
      } catch {
        userTag = 'Unknown User';
      }
      leaderboard += `**${i + 1}.** ${userTag} — ${data.balance} Soul Tokens\n`;
    }

    return interaction.reply({ content: leaderboard });
  }

  if (commandName === 'jobs') {
    const optionsMenu = spookyJobs.map(job => ({
      label: job.name,
      description: `Difficulty: ${job.difficulty} | Reward: ~${job.reward}`,
      value: job.name
    }));

    const menu = new StringSelectMenuBuilder()
      .setCustomId('select_job')
      .setPlaceholder('Choose your spooky profession...')
      .addOptions(optionsMenu);

    const row = new ActionRowBuilder().addComponents(menu);

    const embed = new EmbedBuilder()
      .setTitle('🧰 Available Spooky Jobs')
      .setColor(0x8B0000)
      .setDescription('Pick your job from the dropdown below.\n*You can only hold one job at a time. Jobs reset after 24 hours.*');

    return interaction.reply({ embeds: [embed], components: [row] });
  }

  if (commandName === 'resign') {
    if (!userData.job) return replyPublic('You do not have a job to resign from.');
    userData.job = null;
    userData.lastJobReset = null;
    userData.jobSince = null;
    saveDB();
    return replyPublic('You passed away on the job. Use `/jobs` to pick a new one.');
  }

  if (commandName === 'work') {
    const now = Date.now();
    const cooldown = 3600000;
    if (!userData.job) return replyPublic('You do not have a job. Use `/jobs` to choose one.');
    if (userData.lastWork && now - userData.lastWork < cooldown) {
      const next = new Date(userData.lastWork + cooldown);
      return replyPublic(`You're still recovering. Come back <t:${Math.floor(next / 1000)}:R>.`);
    }

    const job = spookyJobs.find(j => j.name === userData.job);
    if (!job) return replyPublic('Your job was removed. Please select another.');

    const base = job.reward;
    const bonus = getPassiveValue(userData, 'bonus');
    const total = Math.floor(base * (1 + bonus / 100));

    userData.balance += total;
    userData.lastWork = now;
    saveDB();

    return replyPublic(`${job.name} report: You earned ${total} Soul Tokens (base ${base}, bonus ${bonus}%).`);
  }

  if (commandName === 'shop') {
    const embed = new EmbedBuilder()
      .setTitle('🛒 Cursed Item Shop')
      .setColor(0x8B0000)
      .setDescription(
        db.itemShop.map(item => `**${item.name}** — ${item.price} Soul Tokens\n*Effect: ${item.effect}*`).join('\n\n')
      );

    const buttons = db.itemShop.map(item =>
      new ButtonBuilder()
        .setCustomId(`buy_${item.name}`)
        .setLabel(`Buy ${item.name}`)
        .setStyle(1)
    );

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    return interaction.reply({ embeds: [embed], components: rows });
  }

  if (commandName === 'use') {
    const itemName = options.getString('item');
    const index = userData.inventory.findIndex(i => i.toLowerCase() === itemName.toLowerCase());
    if (index === -1) return replyPrivate('You do not have that item.');

    const item = userData.inventory.splice(index, 1)[0];
    const itemData = [...db.itemShop, ...db.allItems].find(i => i.name.toLowerCase() === item.toLowerCase());

    let effectMsg = `You used the ${item}. Nothing happened…`;

    if (itemData) {
      const [type, valueRaw] = itemData.effect.split(' ');
      const value = parseInt(valueRaw);

      if (type === 'gain') {
        userData.balance += value;
        effectMsg = `The ${item} radiates dark energy... you gain ${value} Soul Tokens!`;
      } else {
        userData.passiveEffects = userData.passiveEffects || [];
        userData.passiveEffects.push(itemData.effect);
        effectMsg = `The ${item} clings to you... its effect (${itemData.effect}) is now active.`;
      }
    }

    saveDB();
    return replyPublic(effectMsg);
  }

  if (commandName === 'rotate') {
    if (!interaction.member.permissions.has('ManageGuild')) {
      return replyPublic('You do not have permission to rotate the shop.');
    }

    rotateShop();
    return replyPublic('🌀 The cursed winds have shifted... the item shop has rotated.');
  }

  
  if (commandName === 'gift') {
    if (!interaction.member.permissions.has('ManageMessages')) {
      return replyPublic('You do not have permission to use this command.');
    }

    const target = options.getUser('target');
    const amount = options.getInteger('amount');

    if (!db.users[target.id]) {
      db.users[target.id] = {
        balance: 0,
        inventory: [],
        streak: 0,
        bestStreak: 0,
        passiveEffects: [],
        job: null,
        jobSince: null
      };
    }

    db.users[target.id].balance += amount;
    saveDB();

    return replyPublic(`🎁 You gifted ${amount} Soul Tokens to ${target.username}.`);
  }


  if (commandName === 'tokenhelp') {
    const embed = new EmbedBuilder()
      .setTitle('🕯️ Soul Token Help Menu')
      .setColor(0x8B0000)
      .setDescription(`Here are all available slash commands:`)
      .addFields(
        { name: '/daily', value: 'Claim daily Soul Tokens (24h cooldown)' },
        { name: '/work', value: 'Do your spooky job (1h cooldown)' },
        { name: '/haunt', value: 'Risky haunt for coins or loss (8h cooldown)' },
        { name: '/tarot', value: 'Draw a tarot for a mysterious reward (12h cooldown)' },
        { name: '/maze', value: 'Navigate a cursed maze (1h cooldown)' },
        { name: '/slots', value: 'Try your luck at cursed slots (2h cooldown)' },
        { name: '/tokens', value: 'Check your Soul Token balance' },
        { name: '/shop', value: 'View the rotating item shop' },
        { name: '/use [item]', value: 'Use an item from your inventory' },
        { name: '/donate @user [amount]', value: 'Give Soul Tokens to another user' },
        { name: '/leaderboard', value: 'View the top 5 Soul Token hoarders' },
        { name: '/jobs', value: 'Browse and pick a spooky job via dropdown' },
        { name: '/resign', value: 'Resign from your current job' },
        { name: '/streak', value: 'Check your current and best streaks' },
        { name: '/duel @user [amount]', value: 'Duel another user for Soul Tokens' }
      )
      .setFooter({ text: 'Use wisely, for the spirits are watching...' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

client.login(process.env.YOUR_BOT_TOKEN);
