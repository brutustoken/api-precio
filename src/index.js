// @ts-check

require('dotenv').config();
const env = process.env

const bodyParser = require('body-parser');
const TronWeb = require('tronweb');

const { BigNumber } = require('bignumber.js');
const CronJob = require('cron').CronJob;


const express = require('express');
let cors = require('cors');

const abi_POOLBRST = require("./abi/PoolBRSTv4.json");
const abi_LOTTERY = require("./abi/Lottery.json");
const abi_SwapV3 = require("./abi/swapV3.json");

const { createSecret, decrypData } = require('./services/encryption')

const { Precio, ApiKey } = require('./database')

function delay(s = 3) { return new Promise(res => setTimeout(res, s * 1000)); }

let base = "api"
let version = "v1"

const RUTA = "/" + base + "/" + version + "/"

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());


const allowedBaseDomains = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",") : [];

function isAllowedOrigin(origin = null) {
	if (!origin) return false;
	try {
		const url = new URL(origin);
		const hostname = url.hostname;

		const allowed = allowedBaseDomains.some(base =>
			hostname === base || hostname.endsWith(`.${base}`)
		);

		return allowed;
	} catch (e) {
		//console.log("Error en URL:", e.message);
		return false;
	}
}

const corsOptionsDelegate = function (req, callback) {
	const origin = req.header('Origin');

	if (isAllowedOrigin(origin)) {
		callback(null, {
			origin: origin,
			methods: ['GET', 'POST', 'OPTIONS'],
			allowedHeaders: ['Content-Type', 'Accept'],
		});
	} else {
		callback(null, {
			origin: false,
		});
	}
};

app.use(cors(corsOptionsDelegate))
app.options('*', cors(corsOptionsDelegate));

const port = env.PORT || 8000;
const API = env.APP_GOOGLE_API || "";

const API_last_BRUT = env.APP_GOOGLE_API_BRUT;

const CAP_BRUT = env.APP_GOOGLE_API_CAP_BRUT || "";
const CIRC_BRUT = env.APP_GOOGLE_API_CIRC_BRUT || "";


const WALLET_SR = "TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY";
const TRONGRID_API = "https://api.trongrid.io";
const addressContract = "TBRVNF2YCJYGREKuPKaP7jYYP9R1jvVQeq";
const addressContractBrst = "TF8YgHqnJdWzCbUyouje3RYrdDKJYpGfB3";

const addressContractPoolProxy = "TRSWzPDgkEothRpgexJv7Ewsqo66PCqQ55";
const addressContractlottery = "TKghr3aZvCbo41c8y5vUXofChF1gMmjTHr";
const addressContractFastWitdraw = "TKSpw8UXhJYL2DGdBNPZjBfw3iRrVFAxBr";

const develop = env.APP_develop || "false";

let lastTimeBrut = 0;
let lastPriceBrut;
let lastPriceTRX = 0.15;

let lastPriceUSDT = 0;
let lastPriceUSDD = 0;

let lastTimeBRUT;


// DWY principal cambiada por permisions 1
let tronWeb = new TronWeb({
	fullHost: TRONGRID_API,
	headers: { "TRON-PRO-API-KEY": process.env.tron_api_key },
	privateKey: process.env.APP_PRIVATEKEY_PERM_1

});

let tronWeb_2fa = new TronWeb({
	fullHost: TRONGRID_API,
	headers: { "TRON-PRO-API-KEY": process.env.tron_api_key },
	privateKey: process.env.APP_PRIVATEKEY_PERM_2

});


//cuenta alterna que compra BRST en automatico
let tronWeb2 = new TronWeb({
	fullHost: TRONGRID_API,
	headers: { "TRON-PRO-API-KEY": process.env.tron_api_key2 },
	privateKey: process.env.APP_PRIVATEKEY2

});


//owner proxy Pool v4
let tronWeb3 = new TronWeb({
	fullHost: TRONGRID_API,
	headers: { "TRON-PRO-API-KEY": process.env.tron_api_key2 },
	privateKey: process.env.APP_PRIVATEKEY3

});


let contract_POOL_PROXY = {}
contract_POOL_PROXY = tronWeb3.contract(abi_POOLBRST, addressContractPoolProxy)

let contract_LOTTERY = {}
contract_LOTTERY = tronWeb3.contract(abi_LOTTERY, addressContractlottery)

let contract_SWAPV3 = {}
contract_SWAPV3 = tronWeb3.contract(abi_SwapV3, addressContractFastWitdraw)

precioBRUT()

if (develop === "false") {

	//cada minuto se ejecuta
	let inicio = new CronJob('0 */5 * * * *', async () => {
		console.log('-----------------------------------');
		console.log('>Running: ' + new Date().toLocaleString());
		console.log('-----------------------------------');

		//brutus functions
		await comprarBRST();
		await delay(60)
		await calculoBRST();
		await delay(60)
		await actualizarPrecioBRUTContrato();
		await delay(60)

		console.log('=>Done: ' + new Date().toLocaleString());

	});
	inicio.start();

	let envios = new CronJob('0 0 2 * * *', async function () {
		// solicitar unstaking retiros normales BRST
		enviosTRX();


	}, null, true, 'UTC');

	envios.start();


	// funciones que se ejecutan cada dia
	let dias = new CronJob('0 0 20 * * *', async function () {
		guardarDatos("day");
		console.log("Datos guardados - Día")

		//reset usos de apikeys
		adicionarKeys()
		resetApikeyUses()

		//sorteo loteria
		hacerSorteo();

	}, null, true, 'America/Bogota');

	dias.start();

	let horas = new CronJob('0 0 */1 * * *', async function () {
		guardarDatos("hour");
		console.log("Datos guardados - horas => " + new Date().toLocaleString());

		retirarTrxContrato()

	}, null, true, 'America/Bogota');

	horas.start();


	//let minutos = new CronJob('0 */1 * * * *', async function() {
	//await guardarDatos("minute");
	//	console.log("Datos guardando - minutos => "+new Date().toLocaleString());
	//}, null, true, 'America/Bogota');
	//minutos.start();

} else {

	console.log("----------------- TEST MODE ----------------")
	/// colocar funciones para probar solo en entorno de pruebas

	//retirarTrxContrato()


	let testFunctions = new CronJob('0 * * * * *', async function () {

		console.log("ejecutando funciones tests")

		//await enviosTRX();

		//await calculoBRST();




	}, null, true, 'America/Bogota');
	testFunctions.start();

}

async function resetApikeyUses() {
	try {
		await ApiKey.updateMany({}, { $set: { uses: 0 } });
		console.log('Reiniciado contador de usos de todas las API keys.');
	} catch (error) {
		console.error('Error al reiniciar contadores:', error);
	}
}

/*
async function sendTrxSR(balance) {

	//let balance = await tronWeb3.trx.getBalance()


	if (balance > 110 * 10 ** 6) {

		console.log("balance envio: " + balance)


		balance = new BigNumber(balance)

		let transaction = await tronWeb3.transactionBuilder.sendTrx("TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY", balance.minus(100 * 10 ** 6).toString(10), "TANfdPM6LLErkPzcb2vJN5n6K578Jvt5Yg", {});
		transaction = await tronWeb3.trx.sign(transaction);
		transaction = await tronWeb3.trx.sendRawTransaction(transaction);

		console.log("https://tronscan.io/#/transaction/" + transaction.txid)

	}

	//enviar el 90% TRX a la DWY 
}*/

async function hacerSorteo() {

	// si es tiempo de sorteo sortea
	try {

		let tiempoSorteo = await contract_LOTTERY.proximaRonda().call();
		tiempoSorteo = new BigNumber(tiempoSorteo._hex).toNumber()
		tiempoSorteo = (Date.now() / 1000).toFixed(0) > tiempoSorteo

		let balanceT1 = new BigNumber((await contract_SWAPV3.balance_token_1().call())._hex).toNumber()

		let premio = await contract_LOTTERY._premio().call()
		premio = new BigNumber(premio.prix._hex).toNumber()

		//console.log(balanceT1,premio)

		if (tiempoSorteo && balanceT1 >= premio && true) {

			await contract_LOTTERY.sorteo(true).send()
				.then((h) => {
					console.log("[Ejecución: Sorteo Lottery " + h + "]");

				})
				.catch((err) => { console.log(err) });


		}

	} catch (error) {
		console.log(error)

	}

}

async function guardarDatos(temp) {

	let priceUSDT = await fetch("https://apilist.tronscanapi.com/api/token/price?token=usdt")
		.then((r) => r.json())
		.then((r) => {
			if (r.price_in_usd && r.price_in_trx) {
				lastPriceUSDT = new BigNumber(r.price_in_usd).dividedBy(r.price_in_trx).toNumber()
			}
			return lastPriceUSDT
		})
		.catch((e) => {
			console.log(e)
			return lastPriceUSDT
		})

	let priceUSDD = await fetch("https://apilist.tronscanapi.com/api/token/price?token=usdd")
		.then((r) => r.json())
		.then((r) => {
			if (r.price_in_usd && r.price_in_trx) {
				lastPriceUSDD = new BigNumber(r.price_in_usd).dividedBy(r.price_in_trx).toNumber()
			}
			return lastPriceUSDD
		})
		.catch((e) => {
			console.log(e)
			return lastPriceUSDD
		})

	let fecha = Date.now();

	let consulta2 = await precioBRST();
	consulta2.RATE = new BigNumber(consulta2.RATE)
	let consulta = await precioBRUT();
	consulta.precio = new BigNumber(consulta.precio)

	let instance = new Precio({
		moneda: "brut",
		par: "brut-usd",
		valor: consulta.precio.toNumber(),
		valor_alt: [
			{ coin: "usdt", valor: consulta.precio.toNumber() },
			{ coin: "trx", valor: consulta.precio.dividedBy(priceUSDT).dp(6).toNumber() },
			{ coin: "brst", valor: consulta.precio.dividedBy(priceUSDT).dividedBy(consulta2.RATE).dp(6).toNumber() }
		],
		date: fecha,
		epoch: fecha,
		temporalidad: temp

	});

	instance.save({});

	let instance2 = new Precio({
		moneda: "brst",
		par: "brst-trx",
		valor: consulta2.RATE.toNumber(),
		valor_alt: [
			{ coin: "trx", valor: consulta2.RATE.toNumber() },
			{ coin: "usdt", valor: consulta2.RATE.times(priceUSDT).dp(6).toNumber() },
			{ coin: "usdd", valor: consulta2.RATE.times(priceUSDD).dp(6).toNumber() },
			{ coin: "brut", valor: consulta2.RATE.dividedBy(consulta.precio.dividedBy(priceUSDT)).dp(6).toNumber() }
		],
		date: fecha,
		epoch: fecha,
		temporalidad: temp

	});

	instance2.save({});


}

async function retirarTrxContrato() {

	console.log("Retiros Automaticos")

	let descongelando = await tronWeb3.trx.getCanWithdrawUnfreezeAmount("TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY", Date.now())

	console.log("Esta para descongelar: ", descongelando)

	if (descongelando.amount && true) {
		descongelando = new BigNumber(descongelando.amount)

		//Descongela lo disponible
		let transaction = await tronWeb.transactionBuilder.withdrawExpireUnfreeze("TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY");
		transaction = await tronWeb.trx.multiSign(transaction, process.env.APP_PRIVATEKEY_PERM_1, 3);
		transaction = await tronWeb.trx.sendRawTransaction(transaction);

		console.log("se descongelaron " + descongelando.shiftedBy(-6).toString(10) + " TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY: https://tronscan.io/#/transaction/" + transaction.txid)
		await delay(60)

		//enviar lo descongelado al contrato de retiro

		let transaction_2 = await tronWeb.transactionBuilder.sendTrx("TRSWzPDgkEothRpgexJv7Ewsqo66PCqQ55", descongelando.toString(10), "TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY", 4);
		transaction_2 = await tronWeb.trx.multiSign(transaction_2, process.env.APP_PRIVATEKEY_PERM_1, 4);
		transaction_2 = await tronWeb.trx.multiSign(transaction_2, process.env.APP_PRIVATEKEY_PERM_2, 4);

		transaction_2 = await tronWeb.trx.sendRawTransaction(transaction_2);

		console.log("Transferido a TRSWzPDgkEothRpgexJv7Ewsqo66PCqQ55: https://tronscan.io/#/transaction/" + transaction_2.txid)

		await delay(120)

	} else {

		let trxSolicitado = new BigNumber(await trxSolicitadoData())

		console.log("Solicitud: " + trxSolicitado.shiftedBy(-6).toString(10))

		let diferencia = trxSolicitado.shiftedBy(-6).dp(0).shiftedBy(6)
		console.log(diferencia.shiftedBy(-6).toNumber())

		if (diferencia.shiftedBy(-6).toNumber() >= 1 && true) {

			//solicita descongelacion

			let transaction_3 = await tronWeb.transactionBuilder.unfreezeBalanceV2(diferencia.toString(10), 'ENERGY', "TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY", { permissionId: 3 })
			transaction_3 = await tronWeb.trx.multiSign(transaction_3, process.env.APP_PRIVATEKEY_PERM_1, 3);
			transaction_3 = await tronWeb.trx.sendRawTransaction(transaction_3);

			console.log("https://tronscan.io/#/transaction/" + transaction_3.txid)

			await delay(40)



		} else {


			let devolucion = trxSolicitado.times(-1)

			if (devolucion.toNumber() >= 1000 && false) {

				console.log("Devolución: " + devolucion.shiftedBy(-6).toString(10) + " TRX a la wallet madre")

				// retirrar TRX del contrato

				let tx = await contract_POOL_PROXY.redimTRX(devolucion.plus(1 * 10 ** 6).toString(10)).send();
				console.log("Retirado del contrato: https://tronscan.io/#/transaction/" + tx)

				await delay(3)


				//enviarlo a la DWY                                                                         devolucion.toString(10)
				let transaction = await tronWeb.transactionBuilder.sendTrx("TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY", devolucion.toString(10), "TANfdPM6LLErkPzcb2vJN5n6K578Jvt5Yg", 2);
				transaction = await tronWeb.trx.multiSign(transaction, process.env.APP_PRIVATEKEY3, 2);
				transaction = await tronWeb.trx.sendRawTransaction(transaction);

				console.log("Transferido a TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY: https://tronscan.io/#/transaction/" + transaction.txid)
			}


		}

	}

	return "ok"

}

async function actualizarPrecioBRUTContrato() {
	let precio = await fetch(API)
		.then((r) => { return r.json() })
		.catch(() => {
			console.log("error consultar hoja de google BRUT");
			return null
		})

	if (!precio) return;

	console.log(precio.length)

	precio = precio.values[0][0];
	precio = precio.replace(',', '.');
	precio = parseFloat(precio);

	//let precio = 12.58;

	const contract = await tronWeb3.contract().at(addressContract)
	if (!contract) return;

	let RATE = await contract.RATE().call()
		.catch(() => null)
	if (!RATE) return;

	RATE = parseInt(RATE._hex);

	if (RATE != (precio * 10 ** 6).toFixed(0) && Date.now() >= lastTimeBRUT + 1 * 3600 * 1000 && true) {
		console.log("actualizando precio BRUT");
		await contract.ChangeRate((precio * 10 ** 6).toFixed(0)).send();
		lastTimeBRUT = Date.now()
	}
}

async function precioBRUT() {
	let precio = lastPriceBrut
	let variacion = 0
	let APY = 0

	let consulta = await fetch(API)
		.then((res) => { return res.json() })
		.catch(error => {
			console.error(error);
			return null
		})

	if (consulta && Date.now() >= lastTimeBrut + 900 * 1000) {

		precio = (consulta.values[0][0]).replace(',', '.');
		precio = parseFloat(precio);

		if (isNaN(precio)) {
			precio = lastPriceBrut;
		}

		lastPriceBrut = precio;
		lastTimeBrut = Date.now();

		console.log("Ultimo precio guardado:", { BRUT: lastPriceBrut })
	}


	let Pricetrx = precio / lastPriceTRX;

	try {

		let consulta3 = await chart("brut", 30, "day")
		if (consulta3.length > 0) {
			variacion = (consulta3[0].value - consulta3[1].value) / (consulta3[1].value)
			APY = (((consulta3[0].value - consulta3[29].value) / (consulta3[29].value)) / 30) * 360
		}

	} catch (error) {
		console.log(error)
	}

	return { precio, Pricetrx, variacion, APY };
}

async function comprarBRST() {

	let cuenta = await tronWeb2.trx.getAccount()
		.catch(() => {
			console.log("Fallo en: comprarBRST")
			return null
		})

	if (!cuenta) return;

	cuenta.balance = 0;
	if (cuenta.balance) {
		cuenta.balance = cuenta.balance / 10 ** 6;
	}

	cuenta.wallet = tronWeb2.address.fromHex(cuenta.address);

	console.log("--------- AUTOCOMPRA BRST -----------");
	console.log("wallet: " + cuenta.wallet);
	console.log("balance: " + cuenta.balance + " TRX");

	console.log("------------------------------");

	// comprar auto brst
	if (cuenta.balance >= 100 && true) {

		let tx = await contract_POOL_PROXY.staking().send({ callValue: (cuenta.balance * 10 ** 6).toFixed(0) });
		console.log("[Ejecución: compra de BRST " + tx + "]");
	}


};

calculoBRST()

async function calculoBRST() {


	let cuenta = await tronWeb.trx.getAccount(WALLET_SR)
		.catch(() => {
			console.log("Fallo en: calculoBRST")
			return null
		})

	if (!cuenta) return;

	cuenta.wallet = tronWeb.address.fromHex(cuenta.address);

	let recompensas = await tronWeb.trx.getReward(cuenta.address);
	recompensas = new BigNumber(recompensas).shiftedBy(-6);

	let permTiempo = (Date.now() >= 1704765600000) && (Date.now() > cuenta.latest_withdraw_time + (86400 * 1000))
	//console.log(permTiempo)

	if (true && permTiempo && recompensas > 0) {
		console.log("[Reclamando recompensa: " + permTiempo + "]");
		let transaction = await tronWeb.transactionBuilder.withdrawBlockRewards(cuenta.address, 3);
		transaction = await tronWeb.trx.multiSign(transaction, process.env.APP_PRIVATEKEY_PERM_1, 3);
		transaction = await tronWeb.trx.sendRawTransaction(transaction);
		console.log("[Transaccion: https://tronscan.io/#/transaction/" + transaction.txid + "]");
	}

	await delay(3)

	let balance = await tronWeb3.trx.getUnconfirmedBalance(WALLET_SR)
	balance = new BigNumber(balance).shiftedBy(-6).toNumber();

	let account = await tronWeb3.trx.getAccount()
		.catch(() => {
			console.log("Fallo en: calculoBRST - 2")
			return null
		})
	if (!account) return

	account.wallet = tronWeb.address.fromHex(account.address);

	let trx2 = null
	let congelado = null
	let descongelando = null
	let trxContractV4 = null
	let trxContractRetirosV4 = null
	let trxContractRetiros_fast = null

	try {

		trxContractV4 = await contract_POOL_PROXY.TRON_BALANCE().call()
		trxContractV4 = new BigNumber(trxContractV4._hex).shiftedBy(-6);

		trxContractRetirosV4 = await tronWeb3.trx.getUnconfirmedBalance(contract_POOL_PROXY.address);
		trxContractRetirosV4 = new BigNumber(trxContractRetirosV4).shiftedBy(-6);

		trxContractRetiros_fast = await tronWeb3.trx.getUnconfirmedBalance(addressContractFastWitdraw);
		trxContractRetiros_fast = new BigNumber(trxContractRetiros_fast).shiftedBy(-6);

		trx2 = await tronWeb3.trx.getAccount(WALLET_SR)
			.catch(() => {
				console.log("Fallo en: calculoBRST - 2")
				return null
			})
		//console.log(trx2)

		if (!trx2) return

		congelado = 0

		if (trx2.frozenV2) {
			congelado = trx2.frozenV2.reduce((acc, item) => item.amount ? acc + item.amount : acc, 0);
			congelado = congelado / 10 ** 6
		}

		if (trx2.delegated_frozenV2_balance_for_bandwidth) {
			congelado += trx2.delegated_frozenV2_balance_for_bandwidth / 10 ** 6
		}

		if (trx2.account_resource && trx2.account_resource.delegated_frozenV2_balance_for_energy) {
			congelado += trx2.account_resource.delegated_frozenV2_balance_for_energy / 10 ** 6
		}
		//console.log(congelado)

		if (trx2.unfrozenV2) {
			descongelando = trx2.unfrozenV2.reduce((acc, item) => item.unfreeze_amount ? acc + item.unfreeze_amount : acc, 0);
			descongelando = descongelando / 10 ** 6
		}
		//console.log(descongelando)


	} catch (error) {
		console.log("error consulta trx: ", WALLET_SR)
	}


	if (trx2 && congelado && congelado > 0 && descongelando && trxContractV4 && trxContractRetirosV4 && trxContractRetiros_fast) {
		//console.log(trx)

		console.log("-------------- EJECUCIÓN V4 ------------");
		console.log("Ejecutor: " + account.wallet);
		console.log("Wallet SR: " + cuenta.wallet);
		console.log(" ")
		console.log("Disponible: " + balance + " TRX");
		console.log("Congelado: " + congelado + " TRX");
		console.log("Descongelando: " + descongelando + " TRX");
		console.log(" ")
		let bTotal = balance + congelado + descongelando
		console.log("Balance Wallet SR: " + bTotal + " TRX");
		console.log(" ")
		console.log("Retiros Normales v4: " + trxContractRetirosV4 + " TRX")
		console.log("Retiros Rapidos v2: " + trxContractRetiros_fast + " TRX")
		console.log(" ")

		let total = parseFloat(congelado) + parseFloat(descongelando) + parseFloat(balance) + parseFloat(trxContractRetirosV4) + parseFloat(trxContractRetiros_fast)

		console.log("Total Disponible: " + total + " TRX");
		console.log(" ")
		console.log("Registro en Contrato: " + trxContractV4 + " TRX");
		console.log(" ")

		let diferenciaV4 = total - trxContractV4
		console.log("Diferencia: " + diferenciaV4 + " TRX");


		let tolerancia = 10; // 1 = 1 TRX
		let cambioPrecio = false

		console.log("Tolerancia cambio de precio(" + cambioPrecio + "): " + tolerancia + " TRX")
		console.log("------------------------------");


		// ajusta las ganancias
		if (diferenciaV4 > tolerancia && cambioPrecio) {
			await contract_POOL_PROXY.gananciaDirecta((diferenciaV4 * 10 ** 6).toFixed(0)).send()
				.then((h) => {
					console.log("[Ejecución: ganancia directa (" + diferenciaV4 + ") " + h + "]");

				})
				.catch((err) => { console.log(err) });
		}

		// ajusta las perdidas
		if (diferenciaV4 * -1 > tolerancia && cambioPrecio) {
			diferenciaV4 = diferenciaV4 * -1;

			let calculo = (diferenciaV4 * 10 ** 6).toFixed(0);
			await contract_POOL_PROXY.asignarPerdida(calculo).send()
				.then((h) => {
					console.log("[Ejecución: Ajuste diferencia Negativa (-" + diferenciaV4 + ") -> " + calculo + " | " + h + " ]");
				})
				.catch((err) => { console.log(err) })

		}
	} else {
		console.log("error consulta trx en SR")
	}

};

precioBRST()

async function precioBRST() {

	let result = {}

	let RATE = await contract_POOL_PROXY.RATE().call()
		.then((r) => new BigNumber(parseInt(r)).shiftedBy(-6).toNumber())
		.catch((e) => {
			console.log(e);
			return null
		})

	result.RATE = RATE;

	let consulta = await fetch("https://api.just.network/swap/scan/statusinfo")
		.then((r) => { return r.json() })
		.then((r) => { return r.data.trxPrice })
		.catch((e) => { console.log(e); return null })

	if (consulta) {
		lastPriceTRX = new BigNumber(consulta).toNumber()
	}

	result.Price = new BigNumber(lastPriceTRX).times(RATE).dp(6).toNumber();

	try {

		let consulta3 = await chart("brst", 31, "day")

		if (consulta3.length > 0) {
			result.variacion = (consulta3[1].value - consulta3[2].value) / (consulta3[2].value)
			result.APY = (((consulta3[1].value - consulta3[30].value) / (consulta3[30].value)) / 30) * 360
		}




	} catch (error) {
		console.log(error)

	}

	return result;
}

async function enviosTRX() {

	let balanceDWY = await tronWeb3.trx.getUnconfirmedBalance(WALLET_SR);
	balanceDWY = new BigNumber(balanceDWY).shiftedBy(-6).minus(95);// unidad TRX

	// retiradas normales por debajo de 1000 TRX las cubre por encima las evita

	let info = await infoContract()

	let solicitado = new BigNumber(info.sun_total).minus(info.sun_en_contrato).shiftedBy(-6)
	//let solicitado = new BigNumber(await trxSolicitadoData())


	if (solicitado.toNumber() > 0 && balanceDWY > 1) {
		// enviar lo que alcance

		if (solicitado.toNumber() > balanceDWY) {
			solicitado = balanceDWY
			balanceDWY = new BigNumber(0)
		} else {
			balanceDWY = balanceDWY.minus(solicitado)
		}

		let transaction = await tronWeb.transactionBuilder.sendTrx("TRSWzPDgkEothRpgexJv7Ewsqo66PCqQ55", solicitado.shiftedBy(6).dp(0).toString(10), "TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY", 4);

		try {

			transaction = await tronWeb.trx.multiSign(transaction, env.APP_PRIVATEKEY_PERM_1, 4);
			transaction = await tronWeb.trx.multiSign(transaction, env.APP_PRIVATEKEY_PERM_2, 4);
			transaction = await tronWeb.trx.sendRawTransaction(transaction);

		} catch (error) {
			console.log("error: " + error)
		}

		if (transaction.result) {
			console.log("Llenado retiradas normales: https://tronscan.io/#/transaction/" + transaction.txid)

		}



	}

	/// retiradas Rapidas
	/// TKSpw8UXhJYL2DGdBNPZjBfw3iRrVFAxBr

	let balanceRapidas = await tronWeb3.trx.getUnconfirmedBalance("TKSpw8UXhJYL2DGdBNPZjBfw3iRrVFAxBr");
	balanceRapidas = new BigNumber(balanceRapidas).shiftedBy(-6);

	let nivel = new BigNumber(2500).minus(balanceRapidas)

	if (nivel.toNumber() > balanceDWY.toNumber()) {
		nivel = balanceDWY
	}

	if (nivel.toNumber() > 0) {

		let transaction = {}

		try {

			transaction = await tronWeb.transactionBuilder.sendTrx("TKSpw8UXhJYL2DGdBNPZjBfw3iRrVFAxBr", nivel.shiftedBy(6).dp(0).toString(10), "TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY", 4);
			transaction = await tronWeb.trx.multiSign(transaction, process.env.APP_PRIVATEKEY_PERM_1, 4);
			transaction = await tronWeb.trx.multiSign(transaction, process.env.APP_PRIVATEKEY_PERM_2, 4);

			transaction = await tronWeb.trx.sendRawTransaction(transaction);

		} catch (error) {
			console.log("error: " + error)

		}

		if (transaction.result) {

			console.log("Llenado Retiradas Rapidas: https://tronscan.io/#/transaction/" + transaction.txid)
		}
	}





}

app.get(RUTA, async (req, res) => {

	res.send({ "ok": true });
});


app.get(RUTA + 'precio/:moneda', async (req, res) => {

	let moneda = req.params.moneda;

	let Data = {}

	if (moneda == "BRUT" || moneda == "brut" || moneda == "brut_usd" || moneda == "BRUT_USD") {


		let consulta = await precioBRUT();

		Data = {
			"moneda": "BRUT",
			"trx": consulta.Pricetrx,
			"usd": consulta.precio,
			"v24h": consulta.variacion * 100
		}

	}

	if (moneda == "BRST" || moneda == "brst" || moneda == "brst_usd" || moneda == "BRST_USD" || moneda == "brst_trx" || moneda == "BRST_TRX") {

		let consulta2 = await precioBRST();

		Data = {
			"moneda": "BRST",
			"trx": consulta2.RATE,
			"usd": consulta2.Price,
			"v24h": consulta2.variacion * 100,
			"IS": (consulta2.variacion * 360) * 100,
			"APY": ((1 + (consulta2.variacion * 360) / 360) ** 360 - 1) * 100,
			"lastAPY": consulta2.APY * 100
		}


	}

	res.json({ success: true, "Ok": true, Data });

});

app.get(RUTA + 'data/:peticion', async (req, res) => {

	let { peticion } = req.params;

	let Data = {}

	let contract = await tronWeb.contract().at(addressContractBrst);
	let SUPPLY = await contract.totalSupply().call();
	SUPPLY = parseInt(SUPPLY._hex);

	SUPPLY = SUPPLY / 10 ** 6;

	if (peticion == "circulating" || peticion == "totalcoins") {

		Data = {
			SUPPLY
		}

	} else {

		Data = {
			circulating: SUPPLY,
			totalCoins: SUPPLY,
		}

	}

	res.json({ Ok: true, Data });

});

async function chart(moneda, limite, temporalidad) {

	let consulta = { error: true, msg: "no data" }

	moneda = moneda.toLowerCase()

	let datos = [];

	try {

		consulta = await Precio.find({ moneda, temporalidad }, { _id: 0, valor: 1, date: 1, valor_alt: 1 }).sort({ date: -1 }).limit(limite)

		datos = consulta.map((obj) => {
			const newObj = obj.toObject();
			newObj.date = (new Date(newObj.date)).getTime()
			newObj.value = newObj.valor
			delete newObj.valor;
			return newObj
		})


	} catch (error) {
		console.log(error)
		datos = []

	}


	return datos;


}

app.get(RUTA + 'chartdata/:moneda', async (req, res) => {

	let { moneda, limite = 30, temporalidad = "day" } = req.params;

	let Data = {}
	let success = false

	if (typeof moneda === 'string' && limite && temporalidad) {
		Data = await chart(moneda, limite, temporalidad)
		success = true
	}

	res.json({ success, Ok: true, Data });

});

app.get(RUTA + 'consutla/energia', async (req, res) => {

	let { wallets = "" } = req.query
	let data = {}

	if (typeof wallets === 'string') {

		wallets = wallets?.split(",");


		if (wallets.length >= 1) {


			let energia = 0;
			for (let index = 0; index < wallets.length; index++) {
				let delegacion = await tronWeb.trx.getCanDelegatedMaxSize(wallets[index], 'ENERGY')
				if (delegacion.max_size) {
					energia += delegacion.max_size
				}

			}

			data = energia

		}
	}

	res.status(200).json({ success: true, data });

});

app.get(RUTA + 'consulta/marketcap/brut', async (req, res) => {

	let valor = await fetch(CAP_BRUT)
		.then((res) => { return res.json() })
		.catch(error => { console.error(error) })
	//console.log(valor)
	valor = (valor.values[0][0]).replace('.', '');
	valor = (valor).replace(',', '.');
	valor = parseFloat(valor);

	let circulante = await fetch(CIRC_BRUT)
		.then((res) => { return res.json() })
		.catch(error => { console.error(error) })

	circulante = (circulante.values[0][0]).replace('.', '');
	circulante = (circulante).replace(',', '.');
	circulante = parseFloat(circulante);

	let result = {
		token: "BRUT",
		marketcap: {
			usdt: valor
		},
		circulatingSupply: circulante,
		totalSupply: 10000

	}

	res.send(result)

})

async function infoContract() {
	let result = { sun_total: "0", trx_total: 0 };
	const contractPool = await tronWeb2.contract(abi_POOLBRST, addressContractPoolProxy);

	let tiempo = (await contractPool.TIEMPO().call()).toNumber() * 1000;
	let diasDeEspera = (tiempo / (86400 * 1000)).toPrecision(2)

	let solicitud = await contractPool.TRON_SOLICITADO().call();
	//console.log(solicitud)
	result.trx_total += parseInt(solicitud._hex) / 10 ** 6

	result.dias_espera = diasDeEspera

	result.sun_en_contrato = await tronWeb.trx.getBalance(addressContractPoolProxy);

	result.trx_en_contrato = result.sun_en_contrato / 10 ** 6

	result.sun_en_contrato = result.sun_en_contrato.toString(10)

	result.sun_total = parseInt(solicitud._hex).toString(10)

	return result
}

app.get(RUTA + 'solicitudes/retiro', async (req, res) => {

	res.send(await infoContract())
})

async function trxSolicitadoData() {
	let consulta = await fetch("http://localhost:3333/api/v1/" + 'balance/retiro_real')
		.then((r) => { return r.text() })
		.catch(() => { return null })

	if (!consulta) return 0;

	return parseFloat(consulta)
}


app.get(RUTA + 'tron/solicitado', async (req, res) => {

	res.status(200).send({ sistema: await trxSolicitadoData(), contrato: await infoContract() })
})

createSecret(env.ENCODE_BRUTUS)
//createSecret(env.ENCODE_CIROTRX)



async function rentEnergy({ expire, transaction, wallet, precio, to_address, amount, duration, resource, id_api, token }) {

	let res = {
		result: false,
		error: true,
		msg: "Parameter Unaviable",
		hash: "0xnull",
		point: "Main-Function"
	}

	if (expire && transaction && wallet && precio && to_address && amount && duration && resource && id_api && token) {

		let hash = await tronWeb.trx.sendRawTransaction(transaction)
		let envio = hash.transaction.raw_data.contract[0].parameter.value

		if (hash.result && envio.amount >= parseInt(precio) && TronWeb.address.fromHex(envio.to_address) === to_address) {

			await delay(3)
			hash = await tronWeb.trx.getTransaction(hash.txid);

			if (hash.ret[0].contractRet === "SUCCESS") {

				let url = "" + process.env.REACT_APP_BOT_URL + resource //energy : bandwidth

				let body1 = {
					"id_api": id_api,
					"wallet": wallet,
					"amount": amount,
					"time": duration,
					"user_id": "api-precio"
				}

				let consulta2 = await fetch(url, {
					method: "POST",
					headers: {
						'token-api': token,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(body1)
				})
					.then((r) => r.json())
					.catch((e) => {
						console.log(e)
						return { response: 0, msg: "Error-API: Asignation Energy" }
					})

				if (consulta2.response === 1) {

					res.result = true

				} else {
					res.error = true
					res.msg = consulta2.msg
					res.hash = hash.txID
					res.point = "Bot-API"
				}

			} else {
				res.error = true
				res.msg = "Not SUCCESS"
				res.hash = hash.txID
				res.point = "Main-API"
			}


		} else {
			res.error = true
			res.msg = "Not Hash, Price, To address"
			res.hash = hash.txID
			res.point = "Main-API"
		}

	} else {

		res.error = true
		res.msg = "No parameters to start"
		res.hash = transaction.txID
		res.point = "Main-API"


	}

	return res

}

app.post(RUTA + 'rent/energy', async (req, res) => {

	let response = { result: false };

	let { data, user } = req.body

	if (!data || !user) {

		response.error = true
		response.msg = "No auth"

	} else {
		let descifrado = decrypData(data, user)

		if (!descifrado.transaction) {
			response.error = true
			response.msg = "Error on data"
		} else {
			response = await rentEnergy(descifrado)

		}

	}


	res.status(200).send(response)


})

async function addKey(key) {

	if (!key) return;

	let keyExiste = await ApiKey.findOne({ key })
		.catch((e) => {
			console.error(e)
			return "key already"
		})

	if (keyExiste !== null) return console.log("key already in use: ", key);

	let instance = new ApiKey({
		key: key,
		lastUse: 0,
		uses: 0
	})

	instance.save({});
}

async function adicionarKeys() {

	const listaKeys = env.lista_api_key?.split(",")

	if (listaKeys) {
		for (let index = 0; index < listaKeys.length; index++) {
			await addKey(listaKeys[index])
		}
	}

}

async function getApiKey() {

	let apikey = null
	let lista = await ApiKey.find({}).sort({ lastUse: 1 }).catch(console.error)

	if (lista.length > 0) {
		apikey = lista[0].key
		await ApiKey.updateOne({ _id: lista[0]._id }, { uses: lista[0].uses + 1, lastUse: Date.now() }).catch(console.error)
	} else {
		console.log("no apikeys saved")
		adicionarKeys()
	}

	return apikey

}

app.get(RUTA + 'selector/apikey', async (req, res) => {

	let apikey = await getApiKey();

	if (!apikey) {
		res.status(500).json({ "ok": false });
	} else {
		res.status(200).json({ "ok": true, apikey });
	}

});

app.get(RUTA + 'test/timeout', async (req, res) => {

	await new Promise(r => setTimeout(r, 60 * 1000));

	res.status(200).json({ result: true });
});

var server = app.listen(port, () => console.log('Escuchando: http://localhost:' + port + '/api/v1'))
server.setTimeout(150 * 1000);
