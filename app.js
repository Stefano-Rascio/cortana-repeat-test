/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/


var osc = require("osc");
var useEmulator = (process.env.NODE_ENV == "development");

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");


var udpPort = new osc.UDPPort({
    remoteAddress: "127.0.0.1",
    remotePort: 9003,
});

udpPort.open();


// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat connector for communicating with the Bot Framework Service
// var connector = new builder.ConsoleConnector().listen();
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var azureTableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);
var inMemoryStorage = new builder.MemoryBotStorage();


// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector, [
    function (session) {
        session.beginDialog ("askName");
    },
    function (session) {
        session.beginDialog ("askTelephoneNumber");
    },
    function (session) {
        session.beginDialog ("askFavouriteColour");
    }
])
.endConversationAction ('bye', 'Ok, thank you', { matches : /^cancel$|^goodbye$/i});

bot.set('storage', inMemoryStorage);

bot.dialog('askName', [
    function (session) {
        let question = 'Hi, what is your name?';
        builder.Prompts.text(session, question, {
             speak: question, 
             inputHint: builder.InputHint.expectingInput
            });
    },
    function (session, results, next) {
        session.dialogData.userName = results.response;
        let message = `Hello ${session.dialogData.userName}!`;
        session.say(message, message);

        udpPort.send({
            address: "/name",
            args: [
                {
                    type: "s",
                    value: session.dialogData.userName
                }
            ]
        });

        if (session.dialogData.userName === 'jump') {
            next();
            return;
        }
        session.endDialog();
    }, 
    function (session, results) {
        session.endConversation ('No need for further questions');
    }
])

.cancelAction("cancel name", "Type anything to start over again", 
{
    matches: /^cancel$/i,
    confirmPrompt: "This will change your name, are you sure?"
});

bot.dialog('askTelephoneNumber', [
    function (session, args) {
        if (args && args.reprompt) {
            let question = "Please insert your telephone number";
            builder.Prompts.text(session, question, {
                speak: question, 
                inputHint: builder.InputHint.expectingInput
            });
        }
        else {
            let question = "What is your telephone number?";
            builder.Prompts.text(session, question, {
                speak: question, 
                inputHint: builder.InputHint.expectingInput
            });
        }
    },
    function (session, results) {
        if (results.response && results.response.match (/\d+/g)) {
            udpPort.send({
                address: "/telephoneNumber",
                args: [
                    {
                        type: "s",
                        value: results.response
                    }
                ]
            });
            session.say(message, message);

            session.endDialog('Telephone Number: %s', results.response);
        }
        else {
            session.replaceDialog ('askTelephoneNumber', { reprompt: true });
        }
    }
])
.beginDialogAction ('askTelephoneNumberHelpAction', 'askTelephoneNumberHelp', { matches: /^help$/i });

bot.dialog ('askTelephoneNumberHelp',
    function (session, args, next) {
        session.endDialog ("Enter your telephone number");
});

bot.dialog('askFavouriteColour', [
    function (session) {
        let question = 'Select your favourite colour from the list';
        let choices = 'red|green|blue';
        builder.Prompts.choice (session, question, choices, {
            speak: speak (session, question) ,
            listStyle : builder.ListStyle.button,
        });
    },
    function (session, results) {
        udpPort.send({
            address: "/colour",
            args: [
                {
                    type: "s",
                    value: results.response.entity
                }
            ]
        });

        session.endDialog ('Colour: %s', results.response.entity);
        if (results.response.entity == 'red') {
            session.endConversation ('No need for further questions');
        }
    }
]);

bot.dialog ('help', [
    function (session) {
        session.endDialog ("Test bot");
    }
])
.triggerAction ({ 
    matches: /^help$/i,
    onSelectAction: (session, args, next) => {
        session.beginDialog (args.action, args);
    }
});