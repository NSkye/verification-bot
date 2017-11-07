const Telegraf = require('telegraf');
const { Extra } = require('telegraf');
const session = require('telegraf/session')
const { EventEmitter } = require('events');
const moment = require('moment');

/** Класс Telegram-бота */
class verificationBot extends EventEmitter {
  /**
   * Создает бота
   * @param {string} tgToken - Telegram Token
   */
  constructor(tgToken) {
    super();
    moment.locale('ru');
    this.activateMessageTemplatesAndMarkups();
    this.newBot(tgToken);
    this.bot.use(session());
    this.bindListeners();
    this.bot.startPolling();
  }
  /**
   Добавляет листенеры к инстансу класса Telegraf
  */
  bindListeners() {
    this.bot.start(this.startHandler.bind(this));
    this.bot.action(this.executeAction.bind(this));
    this.bot.command('mycards', this.myCardsHandler.bind(this));
    this.bot.command('myoperations', this.myTransactionsHandler.bind(this));
    this.bot.command('newoperation', this.newOperationHandler.bind(this));
    this.bot.command('createcard', this.createCardHandler.bind(this));
    this.bot.command('deletecard', this.deleteCardHandler.bind(this));
    this.bot.command('exit', this.exitHandler.bind(this));
    this.bot.hears(/^t\d{4}$/, this.tokenHandler.bind(this));
    this.bot.hears(/\d+/, this.numberHandler.bind(this));
    this.bot.catch((error) => {
      console.log('Verification Bot Error: ', error);
      this.emit('verification_bot_error: ', error);
    });
  }
  /**
   Создает инстанс класса Telegraf
   @param {string} tgToken - Telegram-токен
  */
  newBot(tgToken) {
    try {
      this.bot = new Telegraf(tgToken);
    } catch (e) {
      console.log('Telegraf constructor error: ', e);
      this.emit('telegraf_constructor_error: ', e);
    }
  }

  /**
   Добавляет в класс функции-шаблоны для сообщений
  */
  activateMessageTemplatesAndMarkups() {
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

  /**
   Отвечает на команду /start
   Выводит в консоль ID чата
   @param {Object} ctx - Telegraf context
  */
  startHandler(ctx) {
    console.log('started: ', ctx.from.id);
    try {
      ctx.reply('Добро пожаловать!');
    } catch (error) {
      this.emit('sending_error', {type: 'welcome', chatID: ctx.from.id, error});
    }
  }

  /**
  Вызывается командой /mycards
  Вызывает событие, запрашивающее публикацию данных о картах пользователя
  @param {Object} ctx - Telegraf context
  */
  myCardsHandler(ctx) {
    const chatID = ctx.from.id;
    this.emit('publish_cards_request', {chatID, ctx});
  }
  /**
   Вызывается командой /myoperations
   Изменяет состояние сессии на 'get:transactions'
   Вызывает событие, запрашивающее публикацию данных о картах пользователя
   @param {Object} ctx - Telegraf context
   */
  myTransactionsHandler(ctx) {
    const chatID = ctx.from.id;
    ctx.session.state = 'get:transactions';
    this.emit('publish_cards_request', {ctx, chatID});
  }
  /**
   Вызывается командой /newoperation
   Отвечает сообщением, содержащим 3 кнопки: для всех типов операций
   @param {Object} ctx - Telegraf context
  */
  newOperationHandler(ctx) {
    ctx.reply('Выберите тип операции:', this.markups.operation_types());
  }
  /**
   Вызывается командой /createcard
   Изменяет состояние сессии на 'createcard' в котором ожидается ввод номера карты
   Отвечает обычным сообщением
   @param {Object} ctx - Telegraf context
  */
  createCardHandler(ctx) {
    ctx.session.state = 'createcard';
    ctx.reply('Напишите номер карты, которую желаете добавить');
  }
  /**
   Вызывается командой /deletecard
   Изменяет состояние сессии на 'deletecard'
   Вызывает событие, запрашивающее публикацию данных о картах пользователя
   @param {Object} ctx - Telegraf context
  */
  deleteCardHandler(ctx) {
    const chatID = ctx.from.id;
    ctx.session.state = 'deletecard';
    this.emit('publish_cards_request', {chatID, ctx});
  }
  /**
   Вызывается командой /exit
   Очищает все данные о сессии, путем вызова соответствующей функции
   @param {Object} ctx - Telegraf context
  */
  exitHandler(ctx) {
    this.clearSession(ctx);
    return;
  }
  /**
   Вызывается при отправке пользователем сообщения-токена
   Вызывает событие 'user'
   @param {Object} ctx - Telegraf context
  */
  tokenHandler(ctx) {
    const token = ctx.message.text.slice(1);
    const chatID = ctx.from.id;
    this.emit('user', { token, chatID });
  }
  /**
   Вызывается сообщениями, которые содержат цифры
   В зависимости от состояния прописанного в сессии вызовет один из методов, либо проигнорирует
   @param {Object} ctx - Telegraf context
  */
  numberHandler(ctx) {
    if (!ctx.session.state) {
      return;
    }
    switch (true) {
      case (/^op:/).test(ctx.session.state):
        this.createTransaction(ctx);
        break;
      case (/get:transactions:selectcard/).test(ctx.session.state):
        this.requestTransactions(ctx);
        break;
      case (/createcard/).test(ctx.session.state):
        this.requestCreateCard(ctx);
        break;
      case (/deletecard:selectcard/).test(ctx.session.state):
        this.requestDeleteCard(ctx);
        break;
      default:
        return;
    }
  }
  /**
   Вызывается кликом на кнопку привязанную к сообщению
   В зависимости от того какое сообщение передала кнопка будет вызван соответствующий метод
   @param {String} msg - сообщение, которое было отправлено с кнопки
   @param {Object} ctx - Telegraf context
  */
  async executeAction(msg, ctx) {
    const verify = (/^verify:\d+$/.test(msg)) ? msg : null;
    switch (msg) {
      case verify:
        this.verify(msg, ctx);
        break;
      case 'op:card2card':
        this.processTransaction(ctx);
        break;
      case 'op:pay':
        this.processTransaction(ctx, false, true);
        break;
      case 'op:prepaidCard':
        this.processTransaction(ctx, true);
        break;
      default:
        throw new Error('Verification Bot Session Error');
    }
  }

  /**
   Вызывается нажатием кнопки подтверждения транзакции
   При ошибке вызывает событие sending_error
   @param {String} msg - сообщение которое было отправлено с кнопки
   @param {Object} ctx - Telegraf context
  */
  async verify(msg, ctx) {
    try {
      await this.requestOperationVerification(msg,ctx);
    } catch (error) {
      this.emit('sending_error', {type: 'welcome', chatID: ctx.from.id, error});
    }
  }
  /**
   Вызывается нажатием кнопки подтверждения транзакции
   Вызывает событие 'operation', чтоб передать системе информацию о том, что операция была подтверждена
   Удаляет кнопку из сообщения
   @param {String} msg - сообщение которое было отправлено с кнопки
   @param {Object} ctx - Telegraf context
  */
  async requestOperationVerification(msg, ctx) {
    const chatID = ctx.from.id;
    const cbqID = ctx.callbackQuery.id;
    const msgID = ctx.callbackQuery.message.message_id;
    const operationID = Number(msg.split(':')[1]);
    this.emit('operation', {chatID, cbqID, operationID});
    await this.bot.telegram.editMessageReplyMarkup(chatID, msgID);
  }
  /**
   Запрашивает данные о транзакциях по определенной карте
   Очищает после выполнения данные сессии
   @param {Object} ctx - Telegraf context
  */
  requestTransactions(ctx) {
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
    this.clearSession(ctx);
  }
  /**
   Отправляет через событие номер добавляемой пользователем карты
   Очищает после выполнения данные сессии
   @param {Object} ctx - Telegraf context
  */
  requestCreateCard(ctx) {
    const chatID = ctx.message.from.id;
    const cardNumber = ctx.message.text;
    this.emit('create_card', {chatID, cardNumber});
    return this.clearSession(ctx);
  }
  /**
   Отправляет через событие id карты, которую пользователь решил удалить
   @param {Object} ctx - Telegraf context
  */
  requestDeleteCard(ctx) {
    const chatID = ctx.message.from.id;
    if(!ctx.session.data.cards) {
      return;
    }
    const inputValue = Number(ctx.message.text)-1;
    if (!ctx.session.data.cards[inputValue]) {
      return ctx.reply('Пожалуйста, выберите порядковый номер карты из списка')
    }
    const id = ctx.session.data.cards[inputValue].id;
    this.emit('delete_card', {chatID, id});
  }
  /**
   Начинает процесс получения данных для операции
   Запрашивает у системы список карт через событие
   @param {Object} ctx - Telegraf context
   @param {Boolean} prepaidCard - выбрана ли опция пополнения карты, в случае true, добавит соответствующую информацию в сессию
   @param {Boolen} pay - если осуществляется перевод на мобильный номер, в случае true, выставит соответствующее состояние в сессии
  */
  async processTransaction(ctx, prepaidCard=false, pay=false) {
    if (pay) {
      ctx.session.state = 'op:pay';
    } else {
      ctx.session.state = 'op:card2card';
    }
    if (prepaidCard) {
      ctx.session.info = 'prepaid';
    }
    const chatID = ctx.from.id;
    const msgID = ctx.callbackQuery.message.message_id;
    await this.bot.telegram.editMessageReplyMarkup(chatID, msgID);
    if (pay) {
      await this.bot.telegram.editMessageText(chatID, msgID, undefined, '- перевод денег на счет телефона -');
    } else {
      await this.bot.telegram.editMessageText(chatID, msgID, undefined, '- перевод денег на карту -');
    }
    this.emit('publish_cards_request', {chatID, ctx});
  }
  /**
   Начинает процесс создания транзакци
   Проверяет вводимые пользователем сообщения по правилам, зависящим от состояния сессии
   В зависимости от состояния сессии вызывает следующий метод
   @param {Object} ctx - Telegraf context
  */
  createTransaction(ctx) {
    if(!ctx.session.data.cards) {
      return;
    }
    const inputValue = ctx.message.text;
    const state = ctx.session.state;
    const noCard = !ctx.session.data.cards[Number(inputValue)-1];
    const noCardInList = (/:selectfrom/.test(state) || state === 'op:card2card:selectto') && noCard;
    const wrongPhoneNumber = state==='op:pay:selectto' && !inputValue.match(/^\+7\(?\d{3}\)?\d{3}\-?\d{2}\-?\d{2}$/);
    if (noCardInList) {
      return ctx.reply('Пожалуйста, выберите порядковый номер карты из списка')
    }
    if (wrongPhoneNumber) {
      return ctx.reply('Пожалуйста, введите корректный номер телефона');
    }
    if (/:selectfrom/.test(state)) {
      return this.processFirstCardInformation(ctx, inputValue);
    } else if (state === 'op:card2card:selectto') {
      return this.processSecondCardInformation(ctx, inputValue);
    } else if (state === 'op:pay:selectto') {
      return this.processPhoneNumberInformation(ctx, inputValue);
    } else if (/:selectamount/.test(state)) {
      return this.processAmountInformationAndSendData(ctx, inputValue);
    }
    return console.log(`Неизвестное состояние: ${ctx.session.state}`);
  }
  /**
   Вызывается при выборе пользователем первой карты, участвущей в операции
   Записывает в сессию индекс этой карты
   В зависмости от исходного состояния выводит соответствующее сообщение и переключает состояние на следующее в данном диалоге
   Отправляет сообщение пользователю о следующем действии
   @param {Object} ctx - Telegraf context
   @param {String} inputValue - значение введенное пользователем
  */
  processFirstCardInformation(ctx, inputValue) {
    ctx.session.data.selectfrom = Number(inputValue)-1;
    let response;
    switch (ctx.session.state) {
      case 'op:card2card:selectfrom':
        ctx.session.state = 'op:card2card:selectto';
        response = 'Укажите номер карты, на которую нужно осуществить перевод';
        break;
      case 'op:pay:selectfrom':
        ctx.session.state = 'op:pay:selectto';
        response = 'Укажите номер телефона, на который нужно осуществить перевод';
        break;
      default:
        console.log(`Неизвестное состояние: ${ctx.session.state}`);
    }
    if (ctx.session.info === 'prepaid') {
      response='Укажите номер карты, с которой хотите пополнить';
    }
    return ctx.reply(response);
  }
  /**
   Вызывается при выборе пользователем второй карты, участвущей в операции
   Записывает в сессию индекс этой карты
   Отправляет сообщение пользователю о следующем действии
   @param {Object} ctx - Telegraf context
   @param {String} inputValue - значение введенное пользователем
  */
  processSecondCardInformation(ctx, inputValue) {
    ctx.session.data.selectto = Number(inputValue)-1;
    ctx.session.state = 'op:card2card:selectamount';
    return ctx.reply('Укажите сумму, которую необходимо перевести');
  }
  /**
   Вызывается при выборе пользователем номера телефона, участвующего в операции
   В случае с мобильным платежом будет вызыван вместо метода processSecondCardInformation
   Записывает в сессию индекс этой карты
   Отправляет сообщение пользователю о следующем действии
   @param {Object} ctx - Telegraf context
   @param {String} inputValue - значение введенное пользователем
  */
  processPhoneNumberInformation(ctx, inputValue) {
    ctx.session.data.selectto = inputValue;
    ctx.session.state = 'op:pay:selectamount';
    return ctx.reply('Укажите сумму, которую необходимо перевести');
  }
  /**
   Вызывается при введении пользователем суммы, на которую он желает осуществить транзакцию
   Собирает данные из сессии, полученные во время ввода первых значений
   Обрабатывает данные в соответствии с текущим состоянием сессии
   Вызывает событие, предлагающее проведение транзакции
   Очищает данные сессии
   Отправляет пользователю сообщение о том, что всё прошло успешно
   @param {Object} ctx - Telegraf context
   @param {String} inputValue - значение введенное пользователем
  */
  processAmountInformationAndSendData(ctx, inputValue) {
    const amount = inputValue;
    let from = ctx.session.data.cards[ctx.session.data.selectfrom].id;
    let to = null;
    let phone = null;
    let type;
    if (ctx.session.state === 'op:pay:selectamount') {
      phone = ctx.session.data.selectto;
      type = 'paymentMobile';
    } else {
      to = ctx.session.data.cards[ctx.session.data.selectto].id;
      type = 'card2card';
    }
    if (ctx.session.info === 'prepaid') {
      [from, to] = [to, from];
      type = 'prepaidCard';
    }
    const chatID = ctx.from.id;
    this.emit('create_transaction', {chatID, type, from, to, phone, amount});
    this.clearSession(ctx);
    return ctx.reply('Данные отправлены, ожидайте сообщения подтверждения');
  }

  /**
   Очищает значения сессии
   @param {Object} ctx - Telegraf context
  */
  clearSession(ctx) {
    delete ctx.session.state;
    delete ctx.session.data;
    delete ctx.session.info;
    return ctx;
  }

  /**
   Вызывается только снаружи инстанса класса
   Отправляет пользователю сообщение, составленное по выбранному шаблону
   @param {String} template - называние шаблона, который необходимо использовать
   @param {Object} data - данные, содержащие информацию о пользователе и передаваемом сообщении
  */
  async send(template='message', data) {
    const currentTemplate = (this.templates[template]) ? this.templates[template](data) : this.templates['message'](data);
    const text = currentTemplate.text;
    const markup = currentTemplate.markup;
    try {
      await this.bot.telegram.sendMessage(data.chatID, text, markup);
    } catch (error) {
      this.emit('sending_error', {type: template, chatID: data.chatID, error});
    }
  }
  /**
   Вызывается только снаружи инстанса класса
   Требуется для ответа на событие 'operation'
   Вызывает у пользователя на экране всплывающее сообщение о подтверждении транзакции
   @param {Object} data - данные, содержащие информацию о пользователе и callbackQuery
  */
  async operation(data) {
    const {cbqID, text} = data;
    try {
      await this.bot.telegram.answerCbQuery(cbqID, text, true);
    } catch (error) {
      this.emit('sending_error', {type: 'close_touch_action', cbqID, error});
    }
  }
  /**
   Вызывается только снаружи инстанса класса
   Требуется для ответа на событе 'publish_cards_request'
   Переводит массив карт в читаемый формат
   При наличии состояния, записывает карты в сессию и в зависимости от исходного состояния изменяет его
   В зависимости от состояния отправляет либо только список карт, либо добавляет к нему сообщение
   @param {Object} data - содержит контекст и массив карт
  */
  publishCardsRequest(data) {
    const { cards, ctx } = data;
    if (!cards.length) {
      this.clearSession(ctx);
      return ctx.reply('У вас пока нет привязанных карт.\nПривязать карту: /createcard');
    }
    let i = 1;
    const message = cards.map(card => {
      i++;
      return `Карта ${i-1}:\nНомер: ${card.cardNumber}\nБаланс: ${card.balance}\n\n`;
    }).join('');
    let premessage = '';
    switch (ctx.session.state) {
      case 'op:card2card':
        premessage = 'Выберите карту, с которой необходимо перевести деньги:\n\n';
        if (ctx.session.info === 'prepaid') {
          premessage = 'Выбурите карту, которую хотите пополнить:\n\n';
        }
        ctx.session.state = 'op:card2card:selectfrom';
        ctx.session.data = {};
        ctx.session.data.cards = cards;
        return ctx.reply(premessage+message);
        break;
      case 'op:pay':
        premessage = 'Выберите карту, с которой необходимо пополнить телефон:\n\n';
        ctx.session.state = 'op:pay:selectfrom';
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
      case 'deletecard':
        premessage = 'Выберите карту, которую необходимо отвязать:\n\n';
        ctx.session.state = 'deletecard:selectcard';
        ctx.session.data = {};
        ctx.session.data.cards = cards;
        return ctx.reply(premessage+message);
        break;
      default:
        return ctx.reply(message);
    }
  }
  /**
   Вызывается только снаружи инстанса класса
   Требуется для ответа на событие 'publish_transactions_request'
   Переводит массив транзакций в читаемый формат
   Отправляет список карт пользователю
   @param {Object} data - содержит контекст и массив операций
  */
  publishOperationRequest(data) {
    const { operations, ctx } = data;
    if (!operations.length) {
      this.clearSession(ctx);
      return ctx.reply('У вас пока нет произведенных операций по этой карте. Новая операция: /newoperation');
    }
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
