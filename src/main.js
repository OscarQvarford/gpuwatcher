const fs = require('fs');
const puppeteer = require('puppeteer');
const categories = require('./filters/categories.json');
const keywords = require('./filters/keywords.json');
const nodemailer = require('nodemailer');

class Scraper {
	constructor(included, excluded) {
		this.included = included;
		this.excluded = excluded;
	}

	getLastProcessedListing = new Promise((resolve, reject) => {
		fs.readFile('./src/lastProcessedListing.txt', 'utf8', (err, data) => {
			if (err)
				reject(err);
			else
				resolve(data);
		});
	});

	setLastProcessedListing = listingURL => {
		fs.writeFile('./src/lastProcessedListing.txt', listingURL, err => console.log(err));
	}
	
	getListings = new Promise(async (resolve, reject) => {
		const browser = await puppeteer.launch({
			args: [
				'--disable-dev-shm-usage',
				'--shm-size=3gb'
			]
		});

		const page = await browser.newPage();
		await page.goto(`https://www.blocket.se/annonser/hela_sverige/${categories[0]}?cg=5000`, {waitUntil: 'networkidle2'});
		
		this.getLastProcessedListing
			.then(async lastProcessedListing => {
				const included = this.included;
				const excluded = this.excluded;

				const listings = await page.evaluate(({lastProcessedListing, included, excluded}) => {
					const collection = [];
					const titleNodes = document.getElementsByClassName('styled__StyledTitleLink-sc-1kpvi4z-10');
					const priceNodes = document.getElementsByClassName('Price__StyledPrice-sc-1v2maoc-1');

					let firstURL;
					for (let i = 0; i < titleNodes.length; i++) {
						const data = {};
						data.title = titleNodes[i].childNodes[0].innerHTML;
						data.url = titleNodes[i].href;
						data.price = parseInt(priceNodes[i].innerHTML.split(' ').join(''));

						if (firstURL === undefined)
							firstURL = data.url;

						if (data.url === lastProcessedListing)
							break;
						
						for (let j = 0; j < included.length; j++) {
							if (data.title.toLowerCase().includes(included[j].title) &&
									data.price <= included[j].price &&
									excluded.some(word => !data.title.includes(word))) {
								collection.push(data);
								break;
							}
						}
					}

					return {
						collection,
						firstURL
					};
				}, {lastProcessedListing, included, excluded});

				if (listings.firstURL)
					if (listings.firstURL !== lastProcessedListing)
						this.setLastProcessedListing(listings.firstURL);

				resolve(listings.collection)
				await browser.close();
			}).catch(err => reject(err));
	});
}

const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: 'gpu.watcher@gmail.com',
		pass: 'kickan04'
	}
})

const initScraper = () => {
	console.log('initializing scraper...');
	const scraper = new Scraper(keywords.included, keywords.excluded);
	scraper.getListings.then(listings => {
		const date = new Date();

		if (listings.length) {
			for (let i = 0; i < listings.length; i++) {
				const mailOptions = {
					from: 'gpu.watcher@gmail.com',
					to: 'oscar.qvarford@gmail.com',
					subject: 'Nytt grafikkort till salu',
					text: `Nytt grafikkort till salu på Blocket. 
								\n\n${listings[i].title} 
								\n${listings[i].price}kr 
								\n${listings[i].url}`
				}

				transporter.sendMail(mailOptions, (err, info) => {
					if (err) {
						console.log(err);
						if (i === listings.length - 1)
							initScraper();
					} else {
						console.log(info.response);

						if (i === listings.length - 1) {
							console.log(`${date.getHours()}:${date.getMinutes()} Email sent...`);
							initScraper();
						}
					}
				});
			}
		} else {
			console.log(`${date.getHours()}:${date.getMinutes()} No new listings found...`);
			initScraper();
		}
	}).catch(err => console.log(err));
}

initScraper();