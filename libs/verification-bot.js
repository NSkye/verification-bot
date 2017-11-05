const Telegraf = require('telegraf');
const { Extra } = require('telegraf');
const { EventEmitter } = require('events');

class verificationBot extends EventEmitter {
  constructor(tgToken) {
    super();
    this.activateMessageTemplates();
    this.bot = new Telegraf(tgToken);
    this.bindListeners();
    this.bot.startPolling();
  }

  activateMessageTemplates() {
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
        const text = `${data.message}\nВведите код подтверждения на сайте ${data.code}, либо нажмите на кнопку для подтверждения или отклонения операции`;
        const markup = Extra.markup(m =>
          m.inlineKeyboard([
            m.callbackButton('Подтвердить', `${data.operationID}`)
          ]));
        return {text, markup};
      }
    }
    this.markups = {
      'sent': Extra.markup(m =>
        m.inlineKeyboard([
          m.callbackButton('Запрос отправлен')
        ]))
    }
  }

  bindListeners() {
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
    this.bot.action(async (msg, ctx) => {
      const chatID = ctx.from.id;
      const cbqID = ctx.callbackQuery.id;
      const msgID = ctx.callbackQuery.message.message_id;
      const operationID = Number(msg);
      this.emit('operation', {chatID, cbqID, operationID});
      await this.bot.telegram.editMessageReplyMarkup(chatID, msgID);
    });
  }

  async closeTouchAction(cbqID, text) {
    try {
      await this.bot.telegram.answerCallbackQuery(cbqID, text, undefined, true);
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
