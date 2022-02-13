const express = require('express');
const fetch = require('node-fetch');
const TronWeb = require('tronweb');
var cors = require('cors')
require('dotenv').config();

function delay(ms) {
	return new Promise(res => setTimeout(res, ms));
}

const app = express();
app.use(cors());


const port = process.env.PORT || 3004;
const PEKEY = process.env.APP_PRIVATEKEY;
const API = process.env.APP_GOOGLE_API;

const TRONGRID_API = "https://api.trongrid.io";
const addressContract = process.env.APP_CONTRACT || "TBRVNF2YCJYGREKuPKaP7jYYP9R1jvVQeq";
const addressContractPool = process.env.APP_CONTRACT_POOL || "TMzxRLeBwfhm8miqm5v2qPw3P8rVZUa3x6";
const addressContractBrst = process.env.APP_CONTRACT_BRST || "TF8YgHqnJdWzCbUyouje3RYrdDKJYpGfB3";

tronWeb = new TronWeb(
	TRONGRID_API,
	TRONGRID_API,
	TRONGRID_API,
	PEKEY
);

app.get('/api/v1',async(req,res) => {

    res.send("Conectado y funcionando v1.0");
});


app.get('/api/v1/precio/:moneda',async(req,res) => {

    let moneda = req.params.moneda;

  	var response = {};

	if (moneda == "BRUT" || moneda == "brut" || moneda == "brut_usd" || moneda == "BRUT_USD") {

		let consulta = await fetch(API)
		.catch(error =>{console.error(error)})
		const json = await consulta.json();

		let precio = json.values[0];
		precio = precio[1];
		precio = precio.replace(',', '.');
		precio = parseFloat(precio);

		let contract = await tronWeb.contract().at(addressContract);
		let RATE = await contract.RATE().call();
		RATE = parseInt(RATE._hex);

		if(RATE != precio*10**6){
			await contract.ChangeRate(precio*10**6).send();
		}
		
		response = {
				"Ok": true,
		    	"Data": {
		    		"precio": precio,
		    		"par": "BRUT_USD"
				}
		}
	    res.status(200).send(response);

	}if (moneda == "BRST" || moneda == "brst" || moneda == "brst_usd" || moneda == "BRST_USD" || moneda == "brst_trx" || moneda == "BRST_TRX") {

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

		response = {
				"Ok": true,
		    	"Data": {
					"moneda": "BRST",
		    		"trx": RATE,
					"usd": Price

				}
		}
	    res.send(response);

	}else{

		response = {
				"Ok": false,
		    	"Message": "No exciste o está mal escrito verifica que tu token si esté listado",
		    	"Data": {}
		}
	    res.send(response);

	}
});

app.get('/api/v1/data/:peticion',async(req,res) => {

    let peticion = req.params.peticion;

  	var response = {};

	if (peticion == "circulating" || peticion == "totalcoins" ) {

		let contract = await tronWeb.contract().at(addressContractBrst);
		let SUPPLY = await contract.totalSupply().call();
		SUPPLY = parseInt(SUPPLY._hex);

		response = SUPPLY/10**6;
	    res.status(200).send(`${response}`);

	}else{

		response = {
				"Ok": false,
		    	"Message": "No exciste o está mal escrito verifica que tu token si esté listado",
		    	"Data": {}
		}
	    res.send(response);

	}
});


app.listen(port, ()=> console.log('Escuchando Puerto: ' + port))
