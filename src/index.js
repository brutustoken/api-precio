const express = require('express');
const fetch = require('node-fetch');
const TronWeb = require('tronweb');
const mongoose = require('mongoose');

var cors = require('cors');
require('dotenv').config();
const cron = require('node-cron');

function delay(ms) {return new Promise(res => setTimeout(res, ms));}

const app = express();
app.use(cors());

const port = process.env.PORT || 3004;
const PEKEY = process.env.APP_PRIVATEKEY;
const PEKEY2 = process.env.APP_PRIVATEKEY2;
const API = process.env.APP_GOOGLE_API;
const uriMongoDB = process.env.APP_URIMONGODB

const API_last_BRUT = process.env.APP_GOOGLE_API_BRUT;
const API_last_BRST = process.env.APP_GOOGLE_API_BRST;

const TRONGRID_API = "https://api.trongrid.io";
const addressContract = process.env.APP_CONTRACT || "TBRVNF2YCJYGREKuPKaP7jYYP9R1jvVQeq";
const addressContractPool = process.env.APP_CONTRACT_POOL || "TMzxRLeBwfhm8miqm5v2qPw3P8rVZUa3x6";
const addressContractBrst = process.env.APP_CONTRACT_BRST || "TF8YgHqnJdWzCbUyouje3RYrdDKJYpGfB3";

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
  epoch: Number
});

const PrecioBRST = mongoose.model('brst', Precios);
const PrecioBRUT = mongoose.model('brut', Precios);

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

var base = "api"
var version = "v1"

const URL = "/"+base+"/"+version+"/"

var lastTimeBRUT;

var tronWeb = new TronWeb(
	TRONGRID_API,
	TRONGRID_API,
	TRONGRID_API,
	PEKEY
);

var tronWeb2 = new TronWeb(
	TRONGRID_API,
	TRONGRID_API,
	TRONGRID_API,
	PEKEY2
);

cron.schedule('*/30 * * * * *', async() => {
	console.log('-----------------------------------');
	console.log('>Running :'+new Date().toLocaleString());
	console.log('-----------------------------------');
  	//await upDatePrecio(); lo hace el de telegram
	await comprarBRST();
	await ajusteMoneda();
	await actualizarPrecioBRUTContrato();
	console.log('=>Done: '+new Date().toLocaleString());
	
});

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
	if (true && hoy > cuenta.latest_withdraw_time+86400000 && recompensas > 0) {
		console.log("[Reclamando recompensa: "+(hoy > cuenta.latest_withdraw_time+86400000)+"]");
		const tradeobj = await tronWeb.transactionBuilder.withdrawBlockRewards(cuenta.address, 1);
		const signedtxn = await tronWeb.trx.sign(tradeobj, PERKSA);
		const receipt = await tronWeb.trx.sendRawTransaction(signedtxn);
		console.log("[Transaccion: "+receipt.txid+"]");

		if(true){
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
	if (true && cuenta.balance > 1) {
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

	const contractPool = await tronWeb.contract().at(addressContractPool);

	var trxContract = (await contractPool.TRON_BALANCE().call()).toNumber()/10**6;
	
	console.log("---------DISPONIBLE-----------");
	console.log("Cuenta: "+cuenta.balance+" TRX");
	console.log("Votos: "+votos+" TRX");
	var total = cuenta.balance+votos;
	console.log("Total: "+total+" TRX");
	console.log("Contrato: "+trxContract+" TRX");
	var diferencia = (total-trxContract).toFixed(6)
	console.log("Diferencia: "+diferencia+" TRX");

	console.log("------------------------------");
	console.log("Wallet ajustes: "+cuenta.wallet);
	console.log("------------------------------");

	// ajusta las perdidas o ganancias
	if(diferencia > 0 && true){
		var tx = await contractPool.gananciaDirecta(parseInt(diferencia*10**6)).send().catch((err)=>{console.log(err)});
		console.log("[Ejecución: ganancia directa "+tx+"]");
	}

	var recompensas = await tronWeb.trx.getReward(cuenta.address);
	recompensas = recompensas/10**6;

	if (true && Date.now() > cuenta.latest_withdraw_time+86400000 && recompensas > 0) {
		console.log("[Reclamando recompensa: "+(Date.now() > cuenta.latest_withdraw_time+86400000)+"]");
		const tradeobj = await tronWeb.transactionBuilder.withdrawBlockRewards(cuenta.address, 1);
		const signedtxn = await tronWeb.trx.sign(tradeobj, PEKEY);
		const receipt = await tronWeb.trx.sendRawTransaction(signedtxn);
		console.log("[Transaccion: "+receipt.txid+"]");
	}

};

async function actualizarPrecioBRUTContrato() {
	let precio = await fetch(API)
	.catch(error =>{console.error(error)})
	const json = await precio.json();

	precio = json.values[0];
	precio = precio[1];
	precio = precio.replace(',', '.');
	precio = parseFloat(precio);

	//let precio = 12.92;

	let contract = await tronWeb.contract().at(addressContract);
	let RATE = await contract.RATE().call();
	RATE = parseInt(RATE._hex);

	if(RATE != parseInt(precio*10**6) && Date.now() >= lastTimeBRUT + 1*3600*1000 && true){
		console.log("actualizando precio BRUT");
		await contract.ChangeRate(parseInt(precio*10**6)).send();
		lastTimeBRUT = Date.now()
	}
}

app.get(URL,async(req,res) => {

    res.send("Conectado y funcionando v1.0");
});


app.get(URL+'precio/:moneda',async(req,res) => {

    let moneda = req.params.moneda;

  	var response = {
		"Ok": false,
		"Message": "No exciste o está mal escrito verifica que tu token si esté listado",
		"Data": {}
	}

	if (moneda == "BRUT" || moneda == "brut" || moneda == "brut_usd" || moneda == "BRUT_USD") {

		
		let precio = await fetch(API)
		.catch(error =>{console.error(error)})
		const json = await precio.json();

		precio = (json.values[0][0]).replace(',', '.');
		precio = parseFloat(precio);

		//let precio = 12.30;

		let contract = await tronWeb.contract().at(addressContract);
		let RATE = await contract.RATE().call();
		RATE = parseInt(RATE._hex);

		if(RATE != parseInt(precio*10**6) && false){
			console.log("actualizando precio BRUT");
			await actualizarPrecioBRUTContrato();
		}

		let Pricetrx = await fetch(
			"https://api.just.network/swap/scan/statusinfo"
		  ).catch((error) => {
			console.error(error);
		  });
		Pricetrx = await Pricetrx.json();
		
		Pricetrx = precio / Pricetrx.data.trxPrice;

		let variacion = await fetch(API_last_BRUT).then((res)=>{return res.json()}).catch(error =>{console.error(error)})
		//const json2 = await precio.json();_last_BRUT C8   ||| brst B8

		variacion = (variacion.values[0][0]).replace(',', '.');
		variacion = parseFloat(variacion);

		variacion = (precio-variacion)/precio;
		
		response = {
			"Ok": true,
			"Data": {
				"moneda": "BRUT",
				"trx": Pricetrx,
				"usd": precio,
				"v24h": variacion*100
			}
		}

	}
	
	if (moneda == "BRST" || moneda == "brst" || moneda == "brst_usd" || moneda == "BRST_USD" || moneda == "brst_trx" || moneda == "BRST_TRX") {

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

		let variacion = await fetch(API_last_BRST).then((res)=>{return res.json()}).catch(error =>{console.error(error)})
		variacion = (variacion.values[0][0]).replace(',', '.');
		variacion = parseFloat(variacion);

		variacion = (RATE-variacion)/RATE;

		response = {
				"Ok": true,
		    	"Data": {
					"moneda": "BRST",
		    		"trx": RATE,
					"usd": Price,
					"v24h": variacion*100

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

	if(req.query){
		if(req.query.dias){
			limite = parseInt(req.query.dias)
		}
	}

  	var response = {
		"Ok": false,
		"Message": "No exciste o está mal escrito verifica que tu token si esté listado",
		"Data": {}
	}

	if (moneda == "BRUT" || moneda == "brut" || moneda == "brut_usd" || moneda == "BRUT_USD") {

		let consulta = await PrecioBRUT.find({},{valor:1,date:1}).sort({date: -1}).limit(limite)
		let datos = [];

		for (let index = 0; index < consulta.length; index++) {
			let tiempo = (new Date(consulta[index].date)).getTime()
			let color = colorDown
			if(consulta[index].valor > 0){
				color = colorUp
			}
			
			datos.push({date: tiempo, value: consulta[index].valor, color: color, strokeSettings: {stroke: color}});
			
		}
		response = {
			"Ok": true,
			"Data": datos
		}

	}
	
	if (moneda == "BRST" || moneda == "brst" || moneda == "brst_usd" || moneda == "BRST_USD" || moneda == "brst_trx" || moneda == "BRST_TRX") {

		let consulta = await PrecioBRST.find({},{valor:1,date:1}).sort({date: -1}).limit(limite)

		let datos = [];

		for (let index = 0; index < consulta.length; index++) {
			let tiempo = (new Date(consulta[index].date)).getTime()
			let color = colorDown
			if(consulta[index].valor > 0){
				color = colorUp
			}
			datos.push({date: tiempo, value: consulta[index].valor, color: color, strokeSettings: {stroke: color}});
			
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

		console.log(energia);
	}



	res.send(result);

});

app.listen(port, ()=> console.log('Escuchando Puerto: ' + port))
