require("dotenv").config();

const {
  createBot,
  createProvider,
  createFlow,
  addKeyword,
  EVENTS,
} = require("@bot-whatsapp/bot");
const QRPortalWeb = require("@bot-whatsapp/portal");
const { init } = require("bot-ws-plugin-openai");
const BaileysProvider = require("@bot-whatsapp/provider/baileys");
const MockAdapter = require("@bot-whatsapp/database/mock");
const { handlerAI } = require("./utils");
const { textToVoice } = require("./services/eventlab");

// Configuración del complemento de empleados digitales
const employeesAddonConfig = {
  model: "gpt-4-0613",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
};
const employeesAddon = init(employeesAddonConfig);

// Flujo para manejar mensajes de texto
const flowTextMessage = addKeyword([""]).addAnswer([
  "Hola, es un placer conocerte, en un momento te atenderemos.",
]);

// Flujo para manejar notas de voz
const flowVoiceNote = addKeyword(EVENTS.VOICE_NOTE).addAction(
  async (ctx, ctxFn) => {
    await ctxFn.flowDynamic("Dame un momento para escucharte... 🙉");
    console.log("🤖 Voz a texto....");
    const text = await handlerAI(ctx); // Convierte la nota de voz a texto
    console.log(`🤖 Fin voz a texto....[TEXT]: ${text}`);
    const currentState = ctxFn.state.getMyState();
    const fullSentence = `${currentState?.answer ?? ""}. ${text}`;
    const { employee, answer } = await employeesAddon.determine(fullSentence); // Procesa el texto con OpenAI
    ctxFn.state.update({ answer });
    employeesAddon.gotoFlow(employee, ctxFn); // Redirige al flujo correspondiente
  }
);

// Flujo para manejar interacciones con el staff
const flowStaff = addKeyword(EVENTS.ACTION).addAnswer(
  ["Claro que te interesa, mejor te envío un audio..."],
  null,
  async (_, { flowDynamic, state }) => {
    console.log("🙉 Texto a voz....");
    const currentState = state.getMyState();
    const path = await textToVoice(currentState.answer);
    console.log(`🙉 Fin texto a voz....[PATH]: ${path}`);
    await flowDynamic([{ body: "Escucha esto:", media: path }]);
  }
);

const main = async () => {
  const adapterDB = new MockAdapter(); // Base de datos simulada
  const adapterFlow = createFlow([flowTextMessage, flowVoiceNote, flowStaff]); // Flujos registrados
  const adapterProvider = createProvider(BaileysProvider); // Proveedor de conexión a WhatsApp

  // Definición de empleados digitales
  const employees = [
    {
      name: "EMPLEADO_STAFF_TOUR",
      description:
        "Soy Jorge, el staff amable encargado de atender las solicitudes de los viajeros. Respondo dudas sobre el tour o la ciudad de Madrid con respuestas breves.",
      flow: flowStaff,
    },
  ];
  employeesAddon.employees(employees);

  // Creación del bot
  createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  });

  // Mostrar el portal QR para conectar el bot con WhatsApp
  QRPortalWeb();
};

main();