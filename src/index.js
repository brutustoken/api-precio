const express = require('express');
const fetch = require('node-fetch');
const TronWeb = require('tronweb');
const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');

var cors = require('cors');
require('dotenv').config();
const CronJob = require('cron').CronJob;

function delay(ms) {return new Promise(res => setTimeout(res, ms));}

var base = "api"
var version = "v1"

const URL = "/"+base+"/"+version+"/"

const app = express();
app.use(cors());

const port = process.env.PORT || 3004;
const PEKEY = process.env.APP_PRIVATEKEY;
const PEKEY2 = process.env.APP_PRIVATEKEY2;
const API = process.env.APP_GOOGLE_API;
const uriMongoDB = process.env.APP_URIMONGODB

const API_last_BRUT = process.env.APP_GOOGLE_API_BRUT;
const API_last_BRST = process.env.APP_GOOGLE_API_BRST;

const CAP_BRUT = process.env.APP_GOOGLE_API_CAP_BRUT;
const CIRC_BRUT = process.env.APP_GOOGLE_API_CIRC_BRUT

const TRONGRID_API = "https://api.trongrid.io";
const addressContract = process.env.APP_CONTRACT || "TBRVNF2YCJYGREKuPKaP7jYYP9R1jvVQeq";
const addressContractPool = process.env.APP_CONTRACT_POOL || "TMzxRLeBwfhm8miqm5v2qPw3P8rVZUa3x6";
const addressContractBrst = process.env.APP_CONTRACT_BRST || "TF8YgHqnJdWzCbUyouje3RYrdDKJYpGfB3";

const develop = process.env.APP_develop || "false";

var lastPriceBrut;

precioBRUT();

mongoose.set('strictQuery', false);
mongoose.connect(uriMongoDB)
.then(()=>{
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

const addressParaenergia = "TWqsREyZUtPkBNrzSSCZ9tbzP3U5YUxppf";

// BRST TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY

// otra manuel TWqsREyZUtPkBNrzSSCZ9tbzP3U5YUxppf

const colorDown = {
	r:179,
	g:0,
	b:0,
	_hex: 11730944
  };

const colorUp = {
	r:80,
	g:179,
	b:0,
	_hex: 5288704
  };



var lastTimeBRUT;

var tronWeb = new TronWeb({
	fullHost: TRONGRID_API,
    headers: { "TRON-PRO-API-KEY": process.env.tron_api_key },
    privateKey: PEKEY
	
});

var tronWeb2 = new TronWeb({
	fullHost: TRONGRID_API,
    headers: { "TRON-PRO-API-KEY": process.env.tron_api_key2 },
    privateKey: PEKEY2
	
});

var inicio = new CronJob('0 */1 * * * *', async() => {
	console.log('-----------------------------------');
	console.log('>Running :'+new Date().toLocaleString());
	console.log('-----------------------------------');
  	//await upDatePrecio(); lo hace el de telegram
	await comprarBRST();
	await ajusteMoneda();
	await actualizarPrecioBRUTContrato();
	console.log('=>Done: '+new Date().toLocaleString());
	
});
inicio.start();

var revisionContrato = new CronJob('0 0 */1 * * *', async function() {
	retirarTrxContrato() // contrato de retiros TRX_BRST
}, null, true, 'America/Bogota');
revisionContrato.start();

if(develop === "false"){
	//console.log("entro")
	var dias = new CronJob('0 0 20 * * *', async function() {
		await guardarDatos("day");
		console.log("Datos guardados - Día")
	}, null, true, 'America/Bogota');
	  
	dias.start();

	var horas = new CronJob('0 0 */1 * * *', async function() {
		await guardarDatos("hour");
		console.log("Datos guardados - horas => "+new Date().toLocaleString());
	}, null, true, 'America/Bogota');
	
	  
	horas.start();


	//var minutos = new CronJob('0 */1 * * * *', async function() {
	//await guardarDatos("minute");
	//	console.log("Datos guardando - minutos => "+new Date().toLocaleString());
	//}, null, true, 'America/Bogota');
	//minutos.start();

}else{
	
}


async function datosBrut() {
	let precio = await fetch(API).then((r)=>{return r.json()}).catch(error =>{console.error(error)})
	return precio;

}

async function guardarDatos(temp){

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

	var cuenta = await tronWeb.trx.getAccount(addressContractPool);
	
	let contract = await tronWeb.contract().at(addressContractPool); //TRX_BRST

	let trxSolicitado = await contract.TRON_SOLICITADO().call();
	trxSolicitado = parseInt(trxSolicitado._hex);

	trxSolicitado = new BigNumber(trxSolicitado)
	var balance = new BigNumber(cuenta.balance)

	var trxRemanente = 1*10**6;

	trxSolicitado = trxSolicitado.plus(trxRemanente)

	if(balance.gt(trxSolicitado)){
		var tx = await contract.redimTRX(balance.minus(trxSolicitado).toString(10)).send();
		console.log("https://tronscan.io/#/transaction/"+tx)
	}

}

async function upDatePrecio(){

	var proximoCiclo = await tronWeb.trx.timeUntilNextVoteCycle();
	proximoCiclo = new Date(proximoCiclo*1000).toLocaleString();

	var cuenta = await tronWeb.trx.getAccount();

	var wallet = tronWeb.address.fromHex(cuenta.address);
	console.log("UPDATING PRICE");

	console.log("Wallet: "+wallet);

	cuenta.balance = cuenta.balance/10**6;

	//console.log(cuenta);

	var votos = 0;

	if(cuenta.account_resource.frozen_balance_for_energy.frozen_balance){
		votos += cuenta.account_resource.frozen_balance_for_energy.frozen_balance;
	}
	if(cuenta.account_resource.delegated_frozen_balance_for_energy){
		votos += cuenta.account_resource.delegated_frozen_balance_for_energy;
	}
		
	if(cuenta.frozen[0].frozen_balance){
		votos += cuenta.frozen[0].frozen_balance;
	}
		
	if(cuenta.delegated_frozen_balance_for_bandwidth){
		votos += cuenta.delegated_frozen_balance_for_bandwidth;
	}
		
	votos = parseInt(votos/10**6)


	var recompensas = await tronWeb.trx.getReward(wallet);
	recompensas = recompensas/10**6;

	var ultimoretiro = new Date(cuenta.latest_withdraw_time).toLocaleString();

	var hoy = Date.now();

	var proximoretiro = new Date(cuenta.latest_withdraw_time+86400000).toLocaleString();
	console.log("---------DISPONIBLE-----------");
	console.log("Recompensas: "+recompensas+" TRX");
	console.log("Saldo: "+cuenta.balance+" TRX");
	if(cuenta.votes){
		votos = votos-cuenta.votes[0].vote_count;
		console.log("Votos: "+cuenta.votes[0].vote_count);

	}
	console.log("Nuevos Votos: "+votos);
	console.log("---------TIEMPOS-----------");
	console.log("Ultimo retiro: "+ultimoretiro);
	console.log("Proximo retiro: "+proximoretiro);
	console.log("Proximo Ciclo: "+proximoCiclo);
	console.log("---------EJECUCIÓN-----------");

	// ajusta la caticad de TRX para que siempre sea igual en el contrato
	if(recompensas > 0 && false){
		const contractPool = await tronWeb.contract().at(addressPool);
		var tx = await contractPool.gananciaDirecta(parseInt(recompensas/10**6)).send();
		console.log("[Ejecución Contrato: "+tx+"]");
	}
	
	// Reclamar recompensas cada dia y asignarlo a las ganancias
	if (false && hoy > cuenta.latest_withdraw_time+86400000 && recompensas > 0) {
		console.log("[Reclamando recompensa: "+(hoy > cuenta.latest_withdraw_time+86400000)+"]");
		const tradeobj = await tronWeb.transactionBuilder.withdrawBlockRewards(cuenta.address, 1);
		const signedtxn = await tronWeb.trx.sign(tradeobj, PERKSA);
		const receipt = await tronWeb.trx.sendRawTransaction(signedtxn);
		console.log("[Transaccion: "+receipt.txid+"]");

		if(false){
			const contractPool = await tronWeb.contract().at(addressPool);
			var tx = await contractPool.gananciaDirecta(tronWeb.toSun(recompensas)).send();
			console.log("[Ganancia Directa Contrato: "+tx+"]");
		}
		delay(3000);
	}
	// actualizar balance para congelar todo el disponible
	var cuenta = await tronWeb.trx.getAccount();
	cuenta.balance = cuenta.balance/10**6;

	// se congela todo el saldo a la cuenta principal por energia
	if (false && cuenta.balance > 1) {
		console.log("[Congelando disponible: "+(parseInt(cuenta.balance))+" => "+(cuenta.balance > 1)+"]");
		var toFreez = tronWeb.toSun(parseInt(cuenta.balance));
		const tradeobj = await tronWeb.transactionBuilder.freezeBalance(toFreez, 3, "ENERGY", cuenta.address, addressParaenergia, 1)
		const signedtxn = await tronWeb.trx.sign(tradeobj, PEKEY);
		const receipt = await tronWeb.trx.sendRawTransaction(signedtxn);
		console.log("[Transaccion: "+receipt.txid+"]");
		delay(3000);
	}
	
	var cuenta = await tronWeb.trx.getAccount();
	cuenta.balance = cuenta.balance/10**6;

	var votos = (cuenta.account_resource.frozen_balance_for_energy.frozen_balance+cuenta.account_resource.delegated_frozen_balance_for_energy+cuenta.frozen[0].frozen_balance+cuenta.delegated_frozen_balance_for_bandwidth)/10**6;
	// se verifica si hay votos nuevos y se vota con todos los votos al SR
	votos = parseInt(votos);
	var votar = votos;
	if(cuenta.votes){
		votos = votos-cuenta.votes[0].vote_count;
	}

	if (true && votos > 1) {
		console.log("[+"+(votos)+" votos para SR: "+(votos > 1)+"]");
		console.log("asignar: "+votar)
		const tradeobj = await tronWeb.transactionBuilder.vote({'TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY':votar}, wallet, 1);
		const signedtxn = await tronWeb.trx.sign(tradeobj, PERKSA);
		const receipt = await tronWeb.trx.sendRawTransaction(signedtxn);
		console.log("[Transaccion: "+receipt.txid+"]");
	}

};

async function comprarBRST(){

	var cuenta = await tronWeb2.trx.getAccount();

	cuenta.balance = 0;
	if(cuenta.balance){
		cuenta.balance = cuenta.balance/10**6;
	}

	cuenta.wallet = tronWeb2.address.fromHex(cuenta.address);

	const contractPool = await tronWeb2.contract().at(addressContractPool);

	console.log("--------- AUTOCOMPRA BRST -----------");
	console.log("wallet: "+cuenta.wallet);
	console.log("balance: "+cuenta.balance+" TRX");

	console.log("------------------------------");

	// comprar auto brst
	if(cuenta.balance >= 100 && true){
		
		var tx = await contractPool.staking().send({callValue: parseInt(cuenta.balance*10**6)});
		console.log("[Ejecución: compra de BRST "+tx+"]");
	}
	

};

async function ajusteMoneda(){

	var cuenta = await tronWeb.trx.getAccount();
	cuenta.balance = cuenta.balance/10**6;
	cuenta.wallet = tronWeb.address.fromHex(cuenta.address);

	var recompensas = await tronWeb.trx.getReward(cuenta.address);
	recompensas = recompensas/10**6;

	if (true && Date.now() > cuenta.latest_withdraw_time+(86400*1000) && recompensas > 0) {
		console.log("[Reclamando recompensa: "+(Date.now() > cuenta.latest_withdraw_time+86400000)+"]");
		const tradeobj = await tronWeb.transactionBuilder.withdrawBlockRewards(cuenta.address, 1);
		const signedtxn = await tronWeb.trx.sign(tradeobj, PEKEY);
		const receipt = await tronWeb.trx.sendRawTransaction(signedtxn);
		console.log("[Transaccion: "+receipt.txid+"]");
	}

	await delay(3000)

	var trx = await fetch("https://apilist.tronscanapi.com/api/account/tokens?address=TWVVi4x2QNhRJyhqa7qrwM4aSXnXoUDDwY&start=0&limit=20&token=trx&hidden=0&show=0&sortType=0").then((r)=>{return r.json()}).catch(console.error)
	trx = trx.data[0]

	const contractPool = await tronWeb.contract().at(addressContractPool);
	var trxContract = (await contractPool.TRON_BALANCE().call()).toNumber()/10**6;
	var trxContractRetiros = (await contractPool.TRON_PAY_BALANCE().call()).toNumber()/10**6;
	
	console.log("----------------EJECUCIÓN--------------");
	console.log("Wallet: "+cuenta.wallet);

	console.log("Disponible: "+cuenta.balance+" TRX");
	console.log("Congelado: "+(trx.amount-trx.quantity)+" TRX");

	var total = (parseFloat(trx.amount)+trxContractRetiros)
	console.log("Total: "+total+" TRX");
	console.log("Registro en Contrato: "+trxContract+" TRX");
	console.log("Contrato-retiros: "+trxContractRetiros+" TRX")

	var diferencia = (total-trxContract).toFixed(6)
	console.log("Diferencia: "+diferencia+" TRX");

	console.log("------------------------------");

	var tolerancia = 1; // 1 TRX

	// ajusta las ganancias
	if(diferencia > tolerancia && true){
		var tx = await contractPool.gananciaDirecta(parseInt(diferencia*10**6)).send().catch((err)=>{console.log(err)});
		console.log("[Ejecución: ganancia directa ("+diferencia+") "+tx+"]");
	}

	// ajusta las perdidas
	if(diferencia*-1 > tolerancia && true){
		diferencia = diferencia * -1;

		let calculo = parseInt(diferencia*10**6);
		let tx = await contractPool.asignarPerdida(calculo).send().catch((err)=>{console.log(err)});
		console.log("[Ejecución: Ajuste diferencia Negativa (-"+diferencia+") -> "+calculo+" | "+tx+" ]");
	}

	

};

async function actualizarPrecioBRUTContrato() {
	let precio = await fetch(API).then((r)=>{return r.json()}).catch(error =>{console.error(error);})

	precio = precio.values[0][0];
	//console.log(precio)
	precio = precio.replace(',', '.');
	precio = parseFloat(precio);

	//let precio = 12.58;

	let contract = await tronWeb.contract().at(addressContract);
	let RATE = await contract.RATE().call();
	RATE = parseInt(RATE._hex);

	if(RATE != parseInt(precio*10**6) && Date.now() >= lastTimeBRUT + 1*3600*1000 && true){
		console.log("actualizando precio BRUT");
		await contract.ChangeRate(parseInt(precio*10**6)).send();
		lastTimeBRUT = Date.now()
	}
}

async function precioBRUT(){
	let precio = await fetch(API).then((res)=>{return res.json()}).catch(error =>{console.error(error)})

		precio = (precio.values[0][0]).replace(',', '.');
		precio = parseFloat(precio);
 
		if(isNaN(precio)){
			precio = lastPriceBrut;
		}else{
			lastPriceBrut = precio;
		console.log("Ultimo precio guardado: {BRUT: "+lastPriceBrut+"}")

		}

		let contract = await tronWeb.contract().at(addressContract);
		let RATE = await contract.RATE().call();
		RATE = parseInt(RATE._hex);

		let Pricetrx = await fetch("https://api.just.network/swap/scan/statusinfo").then((res)=>{return res.json()}).catch((error) => {console.error(error);});

		Pricetrx = precio / Pricetrx.data.trxPrice;

		let variacion = await fetch(API_last_BRUT).then((res)=>{return res.json()}).catch(error =>{console.error(error)})

		variacion = (variacion.values[0][0]).replace(',', '.');
		variacion = parseFloat(variacion);

		variacion = (precio-variacion)/precio;

		return {precio: precio, Pricetrx: Pricetrx, variacion: variacion };
}

async function precioBRST(){
	var contractpool = await tronWeb.contract().at(addressContractPool);
		var RATE = await contractpool.RATE().call();
		RATE = parseInt(RATE._hex);
		RATE = RATE/10**6;

		let consulta = await fetch(
			"https://api.just.network/swap/scan/statusinfo"
		  ).catch((error) => {
			console.error(error);
		  });
		var json = await consulta.json();
		
		var Price = RATE * json.data.trxPrice;

		Price = parseInt(Price*10**6);
		Price = Price/10**6;

		/*let variacion = await fetch(API_last_BRST).then((res)=>{return res.json()}).catch(error =>{console.error(error)})
		variacion = (variacion.values[0][0]).replace(',', '.');
		variacion = parseFloat(variacion);

		variacion = (RATE-variacion)/RATE;*/

		let consulta3 = await fetch("https://brutusservices.com/api/v1/chartdata/brst?temporalidad=day&limite=2").then((res)=>{return res.json()}).catch(error =>{console.error(error)})
		consulta3 = consulta3.Data
		//console.log(consulta3)
		let variacion = (consulta3[0].value-consulta3[1].value)/(consulta3[1].value)


		let APY = variacion*360

		return {RATE: RATE, variacion: variacion, Price: Price, APY:APY }
}

app.get(URL,async(req,res) => {

    res.send({"ok":true});
});


app.get(URL+'precio/:moneda',async(req,res) => {

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
				"v24h": consulta.variacion*100
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
					"v24h": consulta2.variacion*100,
					"IS": (consulta2.variacion*360)*100,
					"APY": ((1+(consulta2.variacion*360)/360)**360-1)*100,
					"lastAPY":consulta2.APY*100

				}
		}


	}

	res.send(response);

});

app.get(URL+'data/:peticion',async(req,res) => {

    let peticion = req.params.peticion;

  	var response = {
		"Ok": false,
		"Message": "No exciste o está mal escrito verifica que tu token si esté listado",
		"Data": {}
	}

	if (peticion == "circulating" || peticion == "totalcoins" ) {

		let contract = await tronWeb.contract().at(addressContractBrst);
		let SUPPLY = await contract.totalSupply().call();
		SUPPLY = parseInt(SUPPLY._hex);

		response = SUPPLY/10**6;
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

app.get(URL+'chartdata/:moneda',async(req,res) => {

    let moneda = req.params.moneda;
	let limite = 30;
	let temporalidad = "day"

	if(req.query){

		if(req.query.temporalidad){
			temporalidad = req.query.temporalidad
		}

		if(req.query.limite){
			limite = parseInt(req.query.limite)
		}
	}

  	var response = {
		"Ok": false,
		"Message": "No exciste o está mal escrito verifica que tu token si esté listado",
		"Data": {}
	}

	if (moneda == "BRUT" || moneda == "brut" || moneda == "brut_usd" || moneda == "BRUT_USD") {

		let consulta = await PrecioBRUT.find({ temporalidad: temporalidad },{valor:1,date:1}).sort({date: -1}).limit(limite)

		let datos = [];

		for (let index = 0; index < consulta.length; index++) {
			let tiempo = (new Date(consulta[index].date)).getTime()
			datos.push({date: tiempo, value: consulta[index].valor});
			
		}
		response = {
			"Ok": true,
			"Data": datos
		}

	}
	
	if (moneda == "BRST" || moneda == "brst" || moneda == "brst_usd" || moneda == "BRST_USD" || moneda == "brst_trx" || moneda == "BRST_TRX") {

		let consulta = await PrecioBRST.find({temporalidad: temporalidad},{_id:0,valor:1,date:1}).sort({date: -1}).limit(limite)

		let datos = [];

		for (let index = 0; index < consulta.length; index++) {
			let tiempo = (new Date(consulta[index].date)).getTime();
			datos.push({date: tiempo, value: consulta[index].valor });
			
		}
		response = {
			"Ok": true,
			"Data": datos
		}


	}

	res.send(response);

});

app.get(URL+'consutla/energia',async(req,res) => {

    let peticion = (req.query.wallets).split(",");

  	var result = {
		data: 0
	}

	if ( peticion.length >= 1) {

		const provider_address = peticion;

		var energia = 0;
		for (let index = 0; index < provider_address.length; index++) {
			let delegacion = await tronWeb.trx.getCanDelegatedMaxSize(provider_address[index], 'ENERGY')
			if(delegacion.max_size){
				energia += delegacion.max_size
			}
			
		}

		result.data = energia

	}

	res.send(result);

});

app.get(URL+'consulta/marketcap/brut', async(req,res)=>{

	let valor = await fetch(CAP_BRUT).then((res)=>{return res.json()}).catch(error =>{console.error(error)})
	//console.log(valor)
	valor = (valor.values[0][0]).replace('.', '');
	valor = (valor).replace(',', '.');
	valor = parseFloat(valor);

	let circulante = await fetch(CIRC_BRUT).then((res)=>{return res.json()}).catch(error =>{console.error(error)})
	circulante = (circulante.values[0][0]).replace('.', '');
	circulante = (circulante).replace(',', '.');
	circulante = parseFloat(circulante);

	var result = {
		token: "BRUT",
		marketcap:{
			usdt: valor
		},
		circulatingSupply: circulante,
		totalSupply: 10000
		
	}

	res.send(result)

})

app.get(URL+'solicitudes/retiro', async(req,res)=>{
	var result = { sun_total: 0, trx_total: 0};
	const contractPool = await tronWeb2.contract().at(addressContractPool);

	var deposits = await contractPool.solicitudesPendientesGlobales().call();
    var globRetiros = [];

    var tiempo = (await contractPool.TIEMPO().call()).toNumber() * 1000;
    var diasDeEspera = (tiempo / (86400 * 1000)).toPrecision(2)

    for (let index = 0; index < deposits.length; index++) {

      let solicitud = await contractPool.verSolicitudPendiente(parseInt(deposits[index]._hex)).call();
	  //console.log(solicitud)
	  result.sun_total += parseInt(solicitud[2]._hex)
	  result.trx_total += parseInt(solicitud[2]._hex)/10**6
	}

	result.dias_espera = diasDeEspera
	result.solicitudes = deposits.length

	result.sun_en_contrato = await tronWeb.trx.getBalance(addressContractPool);

	result.trx_en_contrato = result.sun_en_contrato/10**6

	result.sun_en_contrato = result.sun_en_contrato.toString(10)

	result.sun_total = result.sun_total.toString(10)

	res.send(result)
})

app.get(URL+'solicitudes/p2p/venta', async(req,res)=>{
	var result = { };
	const contractPool = await tronWeb2.contract().at(addressContractPool);

	var deposits = await contractPool.solicitudesPendientesGlobales().call();
    var globRetiros = [];

    var tiempo = (await contractPool.TIEMPO().call()).toNumber() * 1000;
    var diasDeEspera = (tiempo / (86400 * 1000)).toPrecision(2)

    for (let index = 0; index < deposits.length; index++) {

      let solicitud = await contractPool.verSolicitudPendiente(parseInt(deposits[index]._hex)).call();
	  let inicio = solicitud[1].toNumber() * 1000

	  let diasrestantes = ((inicio + tiempo - Date.now()) / (86400 * 1000)).toPrecision(2)
	  if(diasrestantes >= 14){
		globRetiros.push({"id": parseInt(deposits[index]._hex),"trx":parseInt(solicitud[2]._hex)/10**6,"tiempoRestante":diasrestantes-14})
	  }
	  
	  
	}

	result.Data = globRetiros

	res.send(result)
})

app.listen(port, ()=> console.log('Escuchando Puerto: ' + port))
