const Telegraf = require('telegraf');
const { Extra } = require('telegraf');
const session = require('telegraf/session')
const { EventEmitter } = require('events');

class verificationBot extends EventEmitter {
  constructor(tgToken) {
    super();
    this.activateMessageTemplatesAndMarkupsAndMarkups();
    this.bot = new Telegraf(tgToken);
    this.bindListeners();
    this.bot.startPolling();
  }

  activateMessageTemplatesAndMarkupsAndMarkups() {
    this.templates = {
      'message': data => {
        const text = `${data.message}`;
        return {text};
      },
      'code': data => {
        const text = `Код подтверждения: ${data.code}\n${data.message}`;
        return {text};
      },
      'touch': data => {
        const text = `${data.message}\nВведите код подтверждения на сайте (${data.code}), либо нажмите на кнопку для подтверждения`;
        const markup = Extra.markup(m =>
          m.inlineKeyboard([
            m.callbackButton('Подтвердить', `verify:${data.operationID}`)
          ]));
        return {text, markup};
      }
    },
    this.markups = {
      'operation_types': () => {
        return Extra.markup(m =>
          m.inlineKeyboard([
            [m.callbackButton('Перевести деньги на карту', `op:card2card`)],
            [m.callbackButton('Перевести деньги на телефон', `op:pay`)],
            [m.callbackButton('Пополнить карту', `op:prepaidCard`)]
          ]));
      }
    }
  }

  bindListeners() {
    this.bot.use(session());
    this.bot.start(ctx => {
      console.log('started: ', ctx.from.id);
      try {
        ctx.reply('Welcome!');
      } catch (e) {
        this.emit('sending_error', {type: 'welcome', chatID: ctx.from.id, error});
      }
    });
    this.bot.hears(/^t\d{4}$/, ctx => {
      const token = ctx.message.text.slice(1);
      const chatID = ctx.from.id;
      this.emit('user', { token, chatID });
    });
    this.bot.action(this.executeAction.bind(this));
    this.bot.command('mycards', (ctx) => {
      const chatID = ctx.from.id;
      this.emit('publish_cards_request', {chatID, ctx});
    });
    this.bot.command('mytransactions', (ctx) => {
      const chatID = ctx.from.id;
      this.emit('publish_transactions_request', {ctx, chatID});
    });
    this.bot.command('newoperation', (ctx) => {
      ctx.reply('Выберите тип операции:', this.markups.operation_types());
    });
    this.bot.hears(/\d+/, (ctx) => {
      if (ctx.session.state!=='op:card2card:ready') {
        return;
      }
      const cards = ctx.session.cards;
      if (!cards[Number(ctx.message.text)]) {
        return ctx.reply('Пожалуйста, укажите номер карты в списке');
      }
      this.emit('bot_transaction', { type,  })
    });
  }

  async processCard2Card(ctx) {
    ctx.session.state = 'op:card2card';
    const chatID = ctx.from.id;
    const msgID = ctx.callbackQuery.message.message_id;
    await this.bot.telegram.editMessageReplyMarkup(chatID, msgID);
    await this.bot.telegram.editMessageText(chatID, msgID, undefined, '- перевод денег на карту -');
    this.emit('publish_cards_request', {chatID, ctx});
  }

  async publishCardsRequest(data) {
    const { cards, ctx } = data;
    const premessage = (ctx.session.state === 'op:card2card') ? 'Выберите карту для проведения транзакции:\n\n' : '';
    let i = 1;
    const message = cards.map(card => {
      i++;
      return `Карта ${i-1}:\nНомер: ${card.cardNumber}\nБаланс: ${card.balance}\n\n`;
    }).join('');
    if (ctx.session.state === 'op:card2card') {
      ctx.session.state = 'op:card2card:ready';
      ctx.session.cards = cards;
      await this.bot.telegram.answerCbQuery(ctx.callbackQuery.id);
    }
    return ctx.reply(premessage+message);
  }

  async requestOperationVerification(msg, ctx) {
    const chatID = ctx.from.id;
    const cbqID = ctx.callbackQuery.id;
    const msgID = ctx.callbackQuery.message.message_id;
    const operationID = Number(msg.split(':')[1]);
    this.emit('operation', {chatID, cbqID, operationID});
    await this.bot.telegram.editMessageReplyMarkup(chatID, msgID);
  }

  async executeAction(msg, ctx) {
    const verify = (/^verify:\d+$/.test(msg)) ? msg : null;
    switch (msg) {
      case verify:
        await this.requestOperationVerification(msg, ctx);
        break;
      case 'op:card2card':
        this.processCard2Card(ctx);
        break;
      case 'op:pay':
        this.processPay(ctx);
        break;
      case 'op:prepaidCard':
        this.processPepaidCard(ctx);
        break;
      default:
        console.log(`unknown callback message: ${msg}`);
    }
  }

  async operation(data) {
    const {cbqID, text} = data;
    try {
      await this.bot.telegram.answerCbQuery(cbqID, text, true);
    } catch (error) {
      this.emit('sending_error', {type: 'close_touch_action', cbqID, error});
    }
  }

  async send(template='message', data) {
    const t = (this.templates[template]) ? this.templates[template] : this.templates['message'];
    try {
      await this.bot.telegram.sendMessage(data.chatID, t(data).text, t(data).markup);
    } catch (error) {
      this.emit('sending_error', {type: template, chatID: data.chatID, error});
    }
  }
}

module.exports = verificationBot;
