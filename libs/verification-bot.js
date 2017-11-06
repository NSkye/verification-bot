const Telegraf = require('telegraf');
const { Extra } = require('telegraf');
const session = require('telegraf/session')
const { EventEmitter } = require('events');
const moment = require('moment');

class verificationBot extends EventEmitter {
  constructor(tgToken) {
    super();
    moment.locale('ru');
    this.activateMessageTemplatesAndMarkupsAndMarkups();
    this.bot = new Telegraf(tgToken);
    this.bot.use(session());
    this.bindListeners();
    this.bot.startPolling();
  }
  //--PRIVATE--
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
    this.bot.start(this.startHandler.bind(this));
    this.bot.action(this.executeAction.bind(this));
    this.bot.command('mycards', this.myCardsHandler.bind(this));
    this.bot.command('myoperations', this.myTransactionsHandler.bind(this));
    this.bot.command('newoperation', this.newOperationHandler.bind(this));
    this.bot.command('exit', this.exitHandler.bind(this));
    this.bot.hears(/^t\d{4}$/, this.tokenHandler.bind(this));
    this.bot.hears(/\d+/, this.numberHandler.bind(this));
  }
  //ADD TEMPLATES
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

  //HANDLERS
  startHandler(ctx) {
    console.log('started: ', ctx.from.id);
    try {
      ctx.reply('Добро пожаловать!');
    } catch (e) {
      this.emit('sending_error', {type: 'welcome', chatID: ctx.from.id, error});
    }
  }

  myCardsHandler(ctx) {
    const chatID = ctx.from.id;
    this.emit('publish_cards_request', {chatID, ctx});
  }
  myTransactionsHandler(ctx) {
    const chatID = ctx.from.id;
    ctx.session.state = 'get:transactions';
    this.emit('publish_cards_request', {ctx, chatID});
  }
  newOperationHandler(ctx) {
    ctx.reply('Выберите тип операции:', this.markups.operation_types());
  }
  exitHandler(ctx) {
    delete ctx.session.state;
    delete ctx.session.data;
    return;
  }
  tokenHandler(ctx) {
    const token = ctx.message.text.slice(1);
    const chatID = ctx.from.id;
    this.emit('user', { token, chatID });
  }
  numberHandler(ctx) {
    if (!ctx.session.state) {
      return;
    }
    switch (ctx.session.state) {
      case 'op:card2card:selectfrom':
        this.createCard2CardTransaction(ctx);
        break;
      case 'op:card2card:selectto':
        this.createCard2CardTransaction(ctx);
        break;
      case 'op:card2card:selectamount':
        this.createCard2CardTransaction(ctx);
        break;
      case 'get:transactions:selectcard':
        this.requestTransactions(ctx);
      default:
        return;
    }
  }
  //ACTION EXECUTER
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
        this.processPrepaidCard(ctx);
        break;
      default:
        console.log(`unknown callback message: ${msg}`);
    }
  }

  //OTHER
  async requestOperationVerification(msg, ctx) {
    const chatID = ctx.from.id;
    const cbqID = ctx.callbackQuery.id;
    const msgID = ctx.callbackQuery.message.message_id;
    const operationID = Number(msg.split(':')[1]);
    this.emit('operation', {chatID, cbqID, operationID});
    await this.bot.telegram.editMessageReplyMarkup(chatID, msgID);
  }
  async processCard2Card(ctx) {
    ctx.session.state = 'op:card2card';
    const chatID = ctx.from.id;
    const msgID = ctx.callbackQuery.message.message_id;
    await this.bot.telegram.editMessageReplyMarkup(chatID, msgID);
    await this.bot.telegram.editMessageText(chatID, msgID, undefined, '- перевод денег на карту -');
    this.emit('publish_cards_request', {chatID, ctx});
  }
  async createCard2CardTransaction(ctx) {
    if(!ctx.session.data.cards) {
      return;
    }
    const inputValue = Number(ctx.message.text)-1;
    if (!ctx.session.data.cards[inputValue] && ctx.session.state!=='op:card2card:selectamount') {
      return ctx.reply('Пожалуйста, выберите порядковый номер карты из списка')
    }
    switch (ctx.session.state) {
      case 'op:card2card:selectfrom':
        ctx.session.data.selectfrom = inputValue;
        ctx.session.state = 'op:card2card:selectto';
        return ctx.reply('Укажите номер карты, на которую нужно осуществить перевод');
        break;
      case 'op:card2card:selectto':
        ctx.session.data.selectto = inputValue;
        ctx.session.state = 'op:card2card:selectamount';
        return ctx.reply('Укажите сумму, которую необходимо перевести');
        break;
      case 'op:card2card:selectamount':
        const amount = inputValue;
        const from = ctx.session.data.cards[ctx.session.data.selectfrom].id;
        const to = ctx.session.data.cards[ctx.session.data.selectto].id;
        const chatID = ctx.from.id;
        this.emit('create_transaction', {chatID, type: 'card2card', from, to, amount});
        delete ctx.session.state;
        delete ctx.session.data;
        ctx.reply('Данные отправлены, ожидайте сообщения подтверждения');
        break;
      default:
        console.log(`Неизвестное состояние: ${ctx.session.state}`);
    }
  }
  async requestTransactions(ctx) {
    if(!ctx.session.data.cards) {
      return;
    }
    const chatID = ctx.from.id;
    const inputValue = Number(ctx.message.text)-1;
    if (!ctx.session.data.cards[inputValue]) {
      return ctx.reply('Пожалуйста, выберите порядковый номер карты из списка')
    }
    const id = ctx.session.data.cards[inputValue].id;
    this.emit('publish_transactions_request', {chatID, id, ctx});
    delete ctx.session.state;
    delete ctx.session.data;
  }

  //--PUBLIC--
  async send(template='message', data) {
    const t = (this.templates[template]) ? this.templates[template] : this.templates['message'];
    try {
      await this.bot.telegram.sendMessage(data.chatID, t(data).text, t(data).markup);
    } catch (error) {
      this.emit('sending_error', {type: template, chatID: data.chatID, error});
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
  async publishCardsRequest(data) {
    const { cards, ctx } = data;
    let i = 1;
    const message = cards.map(card => {
      i++;
      return `Карта ${i-1}:\nНомер: ${card.cardNumber}\nБаланс: ${card.balance}\n\n`;
    }).join('');
    let premessage = '';
    switch (ctx.session.state) {
      case 'op:card2card':
        premessage = 'Выберите карту, с которой необходимо перевести деньги:\n\n';
        ctx.session.state = 'op:card2card:selectfrom';
        ctx.session.data = {};
        ctx.session.data.cards = cards;
        return ctx.reply(premessage+message);
        break;
      case 'get:transactions':
        premessage = 'Выберите карту, операции по которой вам необходимо просмотреть:\n\n';
        ctx.session.state = 'get:transactions:selectcard';
        ctx.session.data = {};
        ctx.session.data.cards = cards;
        return ctx.reply(premessage+message);
        break;
      default:
        return ctx.reply(message);
    }
  }
  async publishOperationRequest(data) {
    const { operations, ctx } = data;
    let i = 1;
    const message = operations.map(operation => {
      i++;
      if (operation.pending) {
        return '';
      }
      const dataCaption = (operation.type === 'paymentMobile') ? 'Номер телефона' : 'Номер карты';
      const date = moment(operation.time, moment.ISO_8601).format('LLL');
      return `Операция ${i-1}:\n${dataCaption}: ${operation.data}\nСумма: ${operation.sum}\nВремя: ${date}\n\n`;
    }).join('');
    ctx.reply(message);
  }
}

module.exports = verificationBot;
