const abi_POOLBRST = require("./abi/PoolBRSTv4");
const abi_LOTTERY = require("./abi/Lottery");

const express = require('express');
const fetch = require('node-fetch');
const TronWeb = require('tronweb');
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');

var cors = require('cors');
require('dotenv').config();
const CronJob = require('cron').CronJob;

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

var base = "api"
var version = "v1"

const URL = "/" + base + "/" + version + "/"

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const port = process.env.PORT || 3004;
const API = process.env.APP_GOOGLE_API;
const uriMongoDB = process.env.APP_URIMONGODB

const API_last_BRUT = process.env.APP_GOOGLE_API_BRUT;
const API_last_BRST = process.env.APP_GOOGLE_API_BRST;

const CAP_BRUT = process.env.APP_GOOGLE_API_CAP_BRUT;
const CIRC_BRUT = process.env.APP_GOOGLE_API_CIRC_BRUT


const WALLET_SR = "TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY";
const TRONGRID_API = "https://api.trongrid.io";
const addressContract = process.env.APP_CONTRACT || "TBRVNF2YCJYGREKuPKaP7jYYP9R1jvVQeq";
const addressContractBrst = process.env.APP_CONTRACT_BRST || "TF8YgHqnJdWzCbUyouje3RYrdDKJYpGfB3";

const addressContractPoolProxy = process.env.APP_CONTRACT_POOL_PROXY || "TRSWzPDgkEothRpgexJv7Ewsqo66PCqQ55";
const addressContractlottery = "TKghr3aZvCbo41c8y5vUXofChF1gMmjTHr";

const develop = process.env.APP_develop || "false";

var lastPriceBrut;
var lastPriceTRX = 0.142;

mongoose.set('strictQuery', false);
mongoose.connect(uriMongoDB)
	.then(() => {
		console.log("conectado MongoDB")
	})
	.catch(console.log)

const Schema = mongoose.Schema;

const Precios = new Schema({
	par: String,
	valor: Number,
	date: Date,
	epoch: Number,
	temporalidad: String
});

const PrecioBRST = mongoose.model('brst 2', Precios);
const PrecioBRUT = mongoose.model('bruts 2', Precios);

var lastTimeBRUT;

var tronWeb = new TronWeb({
	fullHost: TRONGRID_API,
	headers: { "TRON-PRO-API-KEY": process.env.tron_api_key },
	privateKey: process.env.APP_PRIVATEKEY

});

var tronWeb2 = new TronWeb({
	fullHost: TRONGRID_API,
	headers: { "TRON-PRO-API-KEY": process.env.tron_api_key2 },
	privateKey: process.env.APP_PRIVATEKEY2

});

var tronWeb3 = new TronWeb({
	fullHost: TRONGRID_API,
	headers: { "TRON-PRO-API-KEY": process.env.tron_api_key2 },
	privateKey: process.env.APP_PRIVATEKEY3

});


let contract_POOL_PROXY = {}
contract_POOL_PROXY = tronWeb3.contract(abi_POOLBRST, addressContractPoolProxy)

let contract_LOTTERY = {}
contract_LOTTERY = tronWeb3.contract(abi_LOTTERY, addressContractlottery)


precioBRUT()


var inicio = new CronJob('0 */1 * * * *', async () => {
	console.log('-----------------------------------');
	console.log('>Running: ' + new Date().toLocaleString());
	console.log('-----------------------------------');

	//Lottery functions PoolBRST
	llenarWhiteList();


	//brutus functions
	await comprarBRST();
	await calculoBRST();
	await actualizarPrecioBRUTContrato();

	console.log('=>Done: ' + new Date().toLocaleString());

});
inicio.start();

var revisionContrato = new CronJob('0 0 */1 * * *', async function () {
	retirarTrxContrato() // contrato de retiros TRX_BRST
}, null, true, 'America/Bogota');
revisionContrato.start();

if (develop === "false") {
	//console.log("entro")
	var dias = new CronJob('0 0 20 * * *', async function () {
		await guardarDatos("day");
		console.log("Datos guardados - Día")
	}, null, true, 'America/Bogota');

	dias.start();

	var horas = new CronJob('0 0 */1 * * *', async function () {
		await guardarDatos("hour");
		console.log("Datos guardados - horas => " + new Date().toLocaleString());
	}, null, true, 'America/Bogota');


	horas.start();


	//var minutos = new CronJob('0 */1 * * * *', async function() {
	//await guardarDatos("minute");
	//	console.log("Datos guardando - minutos => "+new Date().toLocaleString());
	//}, null, true, 'America/Bogota');
	//minutos.start();

} else {
	/// colocar funciones para probar solo en entorno de pruebas



	///
}

async function llenarWhiteList() {

	// consultar necesario en Lottery

	let premio = await contract_LOTTERY._premio().call()
	premio = new BigNumber(premio[0]._hex)


	//meter lo necesario en el whitelist del Pool

	let apartado = await contract_POOL_PROXY.totalDisponible().call();
	apartado = new BigNumber(apartado._hex)


	if (premio > apartado && true) {
		await contract_POOL_PROXY.setDisponible(premio.plus(1 * 10 ** 6).toString(10)).send()
			.then((h) => {
				console.log("[Ejecución: llenado white List Lottery " + h + "]");

			})
			.catch((err) => { console.log(err) });
	}

	// si es tiempo de sorteo sortea


	let tiempoSorteo = await contract_LOTTERY.proximaRonda().call();
	tiempoSorteo = new BigNumber(tiempoSorteo._hex).toNumber()
	console.log(tiempoSorteo)


	if (parseInt(Date.now() / 1000) > tiempoSorteo) {

		await contract_LOTTERY.sorteo().send()
			.then((h) => {
				console.log("[Ejecución: Sorteo Lottery " + h + "]");

			})
			.catch((err) => { console.log(err) });



	}

}

async function guardarDatos(temp) {

	let fecha = Date.now();

	let consulta2 = await precioBRST();

	let consulta = await precioBRUT();

	var instance = new PrecioBRUT({
		par: "brut-usd",
		valor: consulta.precio,
		date: fecha,
		epoch: fecha,
		temporalidad: temp

	});

	instance.save({});

	var instance2 = new PrecioBRST({
		par: "brst-trx",
		valor: consulta2.RATE,
		date: fecha,
		epoch: fecha,
		temporalidad: temp

	});

	instance2.save({});
}

async function retirarTrxContrato() {

	var cuenta = await tronWeb.trx.getAccount(addressContractPoolProxy);

	let trxSolicitado = await contract_POOL_PROXY.TRON_SOLICITADO().call();
	if (trxSolicitado._hex) trxSolicitado = parseInt(trxSolicitado._hex);
	trxSolicitado = new BigNumber(trxSolicitado);

	var descongelando = await tronWeb.trx.getCanWithdrawUnfreezeAmount("TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY", Date.now() + 14 * 86400 * 1000)
	if (descongelando.amount) {
		trxSolicitado = trxSolicitado.minus(descongelando.amount)
	}

	var RR = await contract_POOL_PROXY.TRON_PAY_BALANCE_FAST().call();
	if (RR._hex) RR = parseInt(RR._hex)
	RR = new BigNumber(RR)

	var WhiteList = await contract_POOL_PROXY.TRON_PAY_BALANCE_WHITE().call();
	if (WhiteList._hex) WhiteList = parseInt(WhiteList._hex)
	WhiteList = new BigNumber(WhiteList)

	var balance = new BigNumber(cuenta.balance)

	trxSolicitado = trxSolicitado.plus(1 * 10 ** 6).plus(RR).plus(WhiteList)


	if (balance.gt(trxSolicitado) && true) {
		console.log("trx en contract: " + balance.shiftedBy(-6).toString(10))
		console.log("Para retirar: " + trxSolicitado.shiftedBy(-6).toString(10))
		console.log("diferencia: " + balance.minus(trxSolicitado).shiftedBy(-6).toString(10))

		var tx = await contract_POOL_PROXY.redimTRX(balance.minus(trxSolicitado).toString(10)).send();
		console.log("https://tronscan.io/#/transaction/" + tx)


		let transaction = await tronWeb3.transactionBuilder.sendTrx("TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY", balance.minus(trxSolicitado).toString(10), "TANfdPM6LLErkPzcb2vJN5n6K578Jvt5Yg", {});
		transaction = await tronWeb3.trx.sign(transaction);
		transaction = await tronWeb3.trx.sendRawTransaction(signedTransaction);

		console.log("https://tronscan.io/#/transaction/" + transaction.txid)


		//enviar el 90% TRX a la DWY 
	}

}

async function actualizarPrecioBRUTContrato() {
	let precio = await fetch(API).then((r) => { return r.json() }).catch(error => { console.error(error); })

	precio = precio.values[0][0];
	//console.log(precio)
	precio = precio.replace(',', '.');
	precio = parseFloat(precio);

	//let precio = 12.58;

	let contract = await tronWeb.contract().at(addressContract);
	let RATE = await contract.RATE().call();
	RATE = parseInt(RATE._hex);

	if (RATE != parseInt(precio * 10 ** 6) && Date.now() >= lastTimeBRUT + 1 * 3600 * 1000 && true) {
		console.log("actualizando precio BRUT");
		await contract.ChangeRate(parseInt(precio * 10 ** 6)).send();
		lastTimeBRUT = Date.now()
	}
}

async function precioBRUT() {
	let precio = await fetch(API).then((res) => { return res.json() }).catch(error => { console.error(error) })

	precio = (precio.values[0][0]).replace(',', '.');
	precio = parseFloat(precio);

	if (isNaN(precio)) {
		precio = lastPriceBrut;
	} else {
		lastPriceBrut = precio;
		console.log("Ultimo precio guardado: {BRUT: " + lastPriceBrut + "}")

	}

	let contract = await tronWeb.contract().at(addressContract);
	let RATE = await contract.RATE().call();
	RATE = parseInt(RATE._hex);

	Pricetrx = precio / lastPriceTRX;

	let variacion = await fetch(API_last_BRUT).then((res) => { return res.json() }).catch(error => { console.error(error) })

	variacion = parseFloat((variacion.values[0][0]).replace(',', '.'));

	variacion = (precio - variacion) / precio;

	return { precio: precio, Pricetrx: Pricetrx, variacion: variacion };
}

async function comprarBRST() {

	var cuenta = await tronWeb2.trx.getAccount();

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

		var tx = await contract_POOL_PROXY.staking().send({ callValue: parseInt(cuenta.balance * 10 ** 6) });
		console.log("[Ejecución: compra de BRST " + tx + "]");
	}


};

async function calculoBRST() {
	var cuenta = await tronWeb.trx.getAccount();
	cuenta.wallet = tronWeb.address.fromHex(cuenta.address);

	var recompensas = await tronWeb.trx.getReward(cuenta.address);
	recompensas = new BigNumber(recompensas).shiftedBy(-6);

	var permTiempo = (Date.now() >= 1704765600000) && (Date.now() > cuenta.latest_withdraw_time + (86400 * 1000))
	//console.log(permTiempo)

	if (true && permTiempo && recompensas > 0) {
		console.log("[Reclamando recompensa: " + permTiempo + "]");
		const tradeobj = await tronWeb.transactionBuilder.withdrawBlockRewards(cuenta.address, 1);
		const signedtxn = await tronWeb.trx.sign(tradeobj);
		const receipt = await tronWeb.trx.sendRawTransaction(signedtxn);
		console.log("[Transaccion: https://tronscan.io/#/transaction/" + receipt.txid + "]");
	}

	await delay(3000)

	var balance = await tronWeb3.trx.getUnconfirmedBalance(WALLET_SR);
	balance = new BigNumber(balance).shiftedBy(-6);

	var account = await tronWeb3.trx.getAccount()
	account.wallet = tronWeb.address.fromHex(account.address);

	var trx = await fetch("https://apilist.tronscanapi.com/api/account/tokens?address=" + WALLET_SR + "&start=0&limit=20&token=trx&hidden=0&show=0&sortType=0")
		.then((r) => { return r.json() })
		.then((r) => { return r.data[0] })
		.catch((e) => { console.error(e); return false })

	if (trx) {
		//console.log(trx)

		var trxContractV4 = (await contract_POOL_PROXY.TRON_BALANCE().call()).toNumber() / 10 ** 6;
		var trxContractRetirosV4 = await tronWeb3.trx.getUnconfirmedBalance(contract_POOL_PROXY.address);
		trxContractRetirosV4 = new BigNumber(trxContractRetirosV4).shiftedBy(-6);

		console.log("-------------- EJECUCIÓN V4 ------------");
		console.log("Ejecutor: " + account.wallet);
		console.log("Wallet SR: " + cuenta.wallet);
		console.log(" ")
		console.log("Disponible: " + balance + " TRX");
		console.log("Congelado: " + (trx.amount - trx.quantity) + " TRX");
		console.log(" ")
		console.log("Para retiros v4: " + trxContractRetirosV4 + " TRX")
		console.log(" ")
		var total = (parseFloat(trx.amount) + parseFloat(trxContractRetirosV4))
		console.log("Total: " + total + " TRX");
		console.log(" ")
		console.log("Registro en Contrato V4: " + trxContractV4 + " TRX");
		console.log(" ")

		var diferenciaV4 = (total - trxContractV4).toFixed(6)
		console.log("Diferencia V4: " + diferenciaV4 + " TRX");

		console.log("------------------------------");

		var tolerancia = 10; // 1 = 1 TRX

		// ajusta las ganancias
		if (diferenciaV4 > tolerancia) {
			await contract_POOL_PROXY.gananciaDirecta(parseInt(diferenciaV4 * 10 ** 6)).send()
				.then((h) => {
					console.log("[Ejecución: ganancia directa (" + diferenciaV4 + ") " + h + "]");

				})
				.catch((err) => { console.log(err) });
		}

		// ajusta las perdidas
		if (diferenciaV4 * -1 > tolerancia) {
			diferenciaV4 = diferenciaV4 * -1;

			let calculo = parseInt(diferenciaV4 * 10 ** 6);
			await contract_POOL_PROXY.asignarPerdida(calculo).send()
				.then((h) => {
					console.log("[Ejecución: Ajuste diferencia Negativa (-" + diferenciaV4 + ") -> " + calculo + " | " + h + " ]");
				})
				.catch((err) => { console.log(err) })

		}
	} else {
		console.log("error consulta trx")
	}

};

precioBRST()

async function precioBRST() {

	let result = {}

	var RATE = await contract_POOL_PROXY.RATE().call();
	RATE = new BigNumber(RATE.toNumber()).shiftedBy(-6).toNumber()

	result.RATE = RATE;

	try {

		let consulta = await fetch("https://api.just.network/swap/scan/statusinfo")
			.then((r) => { return r.json() })
			.then((r) => { return r.data.trxPrice })

		consulta = new BigNumber(consulta).toNumber()

		lastPriceTRX = consulta

	} catch (error) {
		console.log(error);
	}

	var Price = new BigNumber(lastPriceTRX).times(RATE).dp(6).toNumber();

	result.Price = Price;

	let consulta3 = {}

	try {

		consulta3 = await chart("brst", 5, "day")
		result.variacion = (consulta3[0].value - consulta3[1].value) / (consulta3[1].value)

		result.APY = variacion * 360


	} catch {

	}

	//console.log(consulta3)

	console.log(result)
	return result;
}

app.get(URL, async (req, res) => {

	res.send({ "ok": true });
});


app.get(URL + 'precio/:moneda', async (req, res) => {

	let moneda = req.params.moneda;

	var response = {
		"Ok": false,
		"Message": "No exciste o está mal escrito verifica que tu token si esté listado",
		"Data": {}
	}

	if (moneda == "BRUT" || moneda == "brut" || moneda == "brut_usd" || moneda == "BRUT_USD") {


		let consulta = await precioBRUT();

		response = {
			"Ok": true,
			"Data": {
				"moneda": "BRUT",
				"trx": consulta.Pricetrx,
				"usd": consulta.precio,
				"v24h": consulta.variacion * 100
			}
		}

	}

	if (moneda == "BRST" || moneda == "brst" || moneda == "brst_usd" || moneda == "BRST_USD" || moneda == "brst_trx" || moneda == "BRST_TRX") {

		let consulta2 = await precioBRST();

		response = {
			"Ok": true,
			"Data": {
				"moneda": "BRST",
				"trx": consulta2.RATE,
				"usd": consulta2.Price,
				"v24h": consulta2.variacion * 100,
				"IS": (consulta2.variacion * 360) * 100,
				"APY": ((1 + (consulta2.variacion * 360) / 360) ** 360 - 1) * 100,
				"lastAPY": consulta2.APY * 100

			}
		}


	}

	res.send(response);

});

app.get(URL + 'data/:peticion', async (req, res) => {

	let peticion = req.params.peticion;

	var response = {
		"Ok": false,
		"Message": "No exciste o está mal escrito verifica que tu token si esté listado",
		"Data": {}
	}

	if (peticion == "circulating" || peticion == "totalcoins") {

		let contract = await tronWeb.contract().at(addressContractBrst);
		let SUPPLY = await contract.totalSupply().call();
		SUPPLY = parseInt(SUPPLY._hex);

		response = SUPPLY / 10 ** 6;
		res.send(`${response}`);

	}

	res.send(response);

});

/*
app.get(URL+'ajuste',async(req,res) => {

	const contractPool = await tronWeb.contract().at(addressPool);
	var response = {};
	// añade trx a la cuenta 
	if(false){
		//tronWeb.toSun()
		var tx1 = await contractPool.gananciaDirecta(tronWeb.toSun(287)).send();
		response.tx1 = "[Ejecución Contrato: "+tx1+"]";
	}
	// imprime los tokens
	if(false){
		var tx2 = await contractPool.crearBRTS(1).send();
		response.tx2 = "[Ejecución Contrato: "+tx2+"]";
	}
	// transfiere los tokens --- en proceso no usar
	if(false){
		var tx3 = await contractPool.gananciaDirecta(1).send();
		response.tx3 = "[Ejecución Contrato: "+tx3+"]";
	}
	// retira trx de las ganancias
	if(false){
		var tx4 = await contractPool.asignarPerdida(1).send();
		response.tx4 = "[Ejecución Contrato: "+tx4+"]";
	}
   
	res.send(response);

});
*/

async function chart(moneda, limite, temporalidad) {

	let Operador = PrecioBRST

	moneda = moneda.toLowerCase()

	switch (moneda) {
		case "brut":
			Operador = PrecioBRUT
			break;

		default:
			break;
	}

	let consulta = { error: true, msg: "no data" }

	let datos = [];


	try {

		consulta = await Operador.find({ temporalidad: temporalidad }, { valor: 1, date: 1 }).sort({ date: -1 }).limit(limite)


		for (let index = 0; index < consulta.length; index++) {
			let tiempo = (new Date(consulta[index].date)).getTime()
			datos.push({ date: tiempo, value: consulta[index].valor });

		}

	} catch (error) {

	}


	return datos;


}

app.get(URL + 'chartdata/:moneda', async (req, res) => {

	let moneda = req.params.moneda;
	let limite = 30;
	let temporalidad = "day"

	if (req.query) {

		if (req.query.temporalidad) {
			temporalidad = req.query.temporalidad
		}

		if (req.query.limite) {
			limite = parseInt(req.query.limite)
		}
	}

	var response = {
		"Ok": false,
		"Message": "No exciste o está mal escrito verifica que tu token si esté listado",
		"Data": {}
	}


	response = {
		"Ok": true,
		"Data": await chart(moneda, limite, temporalidad)
	}


	res.send(response);

});

app.get(URL + 'consutla/energia', async (req, res) => {

	let peticion = (req.query.wallets).split(",");

	var result = {
		data: 0
	}

	if (peticion.length >= 1) {

		const provider_address = peticion;

		var energia = 0;
		for (let index = 0; index < provider_address.length; index++) {
			let delegacion = await tronWeb.trx.getCanDelegatedMaxSize(provider_address[index], 'ENERGY')
			if (delegacion.max_size) {
				energia += delegacion.max_size
			}

		}

		result.data = energia

	}

	res.send(result);

});

app.get(URL + 'consulta/marketcap/brut', async (req, res) => {

	let valor = await fetch(CAP_BRUT).then((res) => { return res.json() }).catch(error => { console.error(error) })
	//console.log(valor)
	valor = (valor.values[0][0]).replace('.', '');
	valor = (valor).replace(',', '.');
	valor = parseFloat(valor);

	let circulante = await fetch(CIRC_BRUT).then((res) => { return res.json() }).catch(error => { console.error(error) })
	circulante = (circulante.values[0][0]).replace('.', '');
	circulante = (circulante).replace(',', '.');
	circulante = parseFloat(circulante);

	var result = {
		token: "BRUT",
		marketcap: {
			usdt: valor
		},
		circulatingSupply: circulante,
		totalSupply: 10000

	}

	res.send(result)

})

app.get(URL + 'solicitudes/retiro', async (req, res) => {
	var result = { sun_total: 0, trx_total: 0 };
	const contractPool = await tronWeb2.contract().at(addressContractPool);

	var deposits = await contractPool.solicitudesPendientesGlobales().call();
	var globRetiros = [];

	var tiempo = (await contractPool.TIEMPO().call()).toNumber() * 1000;
	var diasDeEspera = (tiempo / (86400 * 1000)).toPrecision(2)

	for (let index = 0; index < deposits.length; index++) {

		let solicitud = await contractPool.verSolicitudPendiente(parseInt(deposits[index]._hex)).call();
		//console.log(solicitud)
		result.sun_total += parseInt(solicitud[2]._hex)
		result.trx_total += parseInt(solicitud[2]._hex) / 10 ** 6
	}

	result.dias_espera = diasDeEspera
	result.solicitudes = deposits.length

	result.sun_en_contrato = await tronWeb.trx.getBalance(addressContractPool);

	result.trx_en_contrato = result.sun_en_contrato / 10 ** 6

	result.sun_en_contrato = result.sun_en_contrato.toString(10)

	result.sun_total = result.sun_total.toString(10)

	res.send(result)
})


app.post(URL + 'alquilar/energia', async (req, res) => {

	console.log(req.body)

	let transaction = req.body.transaction

	console.log(transaction)
	transaction = await tronWeb.trx.sendRawTransaction(transaction)

	console.log(transaction)


	if (transaction.code) {

		res.status(200).send("error")


	} else {

		res.status(200).send("ok")


	}




})

app.listen(port, () => console.log('Escuchando Puerto: ' + port))
