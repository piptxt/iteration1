const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const mongoose = require('mongoose');
const session = require('express-session');
const { createHash } = require('crypto');
const mongoDBStore = require('connect-mongodb-session')(session);

let app = express();

app.set('view engine', 'ejs');
app.use(express.json());
app.use(bodyParser.urlencoded({extended: true}));

app.use(express.static('./public'));

const retrospectDB = "mongodb+srv://retrospect:Retrosp3ct@retrospect.fboiauc.mongodb.net/retrospectDB";
const retrospectConnection = mongoose.connect(retrospectDB);

// Initializing session
const sessionStore = new mongoDBStore({
    uri: retrospectDB,
    url: retrospectConnection,
    collection: 'sessions'
});
app.use(session({
    secret: 'some secret ya foo',
    resave: false,
    saveUninitialized: true,
    store: sessionStore
}));
const isAuth = (req, res, next) => {
    if (req.session.isAuth) {
        next();
    } else {
        res.redirect('/log-in')
    }
}
app.use(function(req, res, next) {
    res.locals.session = req.session;
    next();
});

// SCHEMAS
const UserModel = require('./models/userDB');
const UserCartModel = require('./models/user_cartDB');
const ItemsModel = require('./models/itemsDB');
const { findOneAndDelete } = require('./models/user_cartDB');

// LANDING PAGE
app.get('/', function(req, res){
    let username = null;
    if(req.session.isAuth){
        username = req.session.username;
    }
    res.render('landing-page', {
        username: username
    });
});
app.get('/landing-page', function(req, res){
    let username = null;
    if(req.session.isAuth){
        username = req.session.username;
    }
    res.render('landing-page',{
        username: username
    });
    
});

// ABOUT US
app.get('/about-us', function(req, res){
    let username = null;
    if(req.session.isAuth){
        username = req.session.username;
    }
    res.render('about-us',{
        username: username
    });
});

// SHOP
app.get('/shop', async function(req, res){
    let username = null;

    if(req.session.isAuth){
        username = req.session.username;
    }

    const items = await ItemsModel.find({});

    res.render('shop',{
        username: username,
        items: items
    });
});

// SHOPPING-CART
app.get('/shopping-cart', async function(req, res){
    
    const cart_items = await UserCartModel.find({user_id: req.session._id});
    console.log(cart_items);

    res.render('shopping-cart', {
        cart_items: cart_items,
        username: req.session.username
    })
});
// DELETE ITEM IN SHOPPING CART
app.get('/delete-item/:user_id/:item_name/:size', async function(req, res) {
    const {user_id, item_name, size} = req.params

    console.log(req.params);
    const delete_item = await UserCartModel.updateOne(
        {user_id: req.session._id},
        {$pull: {
            items: {
                item_name: item_name,
                size: size
                }
            }
        } 
    );

    res.redirect('/shopping-cart');

});

//ADD ITEM TO USER CART
app.post('/add-to-cart', async function(req, res){

    if(req.session.isAuth == undefined){
        console.log("Need Account Before adding to cart");
        return res.render('login', {
            msg: "Need Account Before adding to cart. We apologize for the Inconvenience."
        });
    }

    const items = await ItemsModel.find({});

    const {item_name, item_photo ,price, size, quantity} = req.body;
    const total_price = quantity * price;

    console.log("Item Name: " + item_name);
    console.log("Item Photo: " + item_photo)
    console.log("Price: " + price);
    console.log("Size: " + size);
    console.log("Qty: " + quantity);
    console.log("Total Price: " + total_price);
    
    const item =  {item_name, item_photo, price, size, quantity, total_price}

    const find_item = await UserCartModel.findOne({
        user_id: req.session._id,
        items: {
            $elemMatch: {
                item_name: item_name,
                size: size
            }
        }
    });
    console.log("find_item: " + find_item);

    if(find_item) { // IF ITEMS EXIST
        const user_cart = await UserCartModel.updateOne({
                user_id: req.session._id,
                items: {
                    $elemMatch: {
                        item_name: item_name,
                        size: size
                    }
                }
            }, {
                $inc:{
                    "items.$.quantity": quantity,
                    "items.$.total_price": total_price
                }
            });
        console.log("updated item: " + user_cart);
    } else { // IF ITEM DOES NOT EXIST
        const user_cart = await UserCartModel.updateOne(
            {user_id: req.session._id},
            {$push: {items: item}}
        );
    }
    
    return res.redirect('/shop');
});


// SIZE CHART
app.get('/size-chart', function(req, res){
    let username = null;
    if(req.session.isAuth){
        username = req.session.username;
    }
    res.render('size-chart', {
        username: username
    });
});

// LOGIN
app.get('/login', function(req, res){
    const msg = null;
    res.render('login', {msg: msg});
});
app.post('/user-login', async function(req, res){

    const { username, password } = req.body;
    console.log(username + " " + password);
    
    let users = await UserModel.findOne({ username: username});
    // check if there is an existing user and if password is correct
    if(!users){
        console.log('No user found');
        return res.redirect('/login');
    } 

    const hashedPassword = createHash('sha256').update(password).digest('hex');
    if (users.password !== hashedPassword){
        console.log('Wrong password');
        return res.redirect('/login');
    }

    req.session.isAuth = true;
    res.session = users;
    req.session._id = users._id;
    req.session.username = users.username;
    console.log(req.session);
    console.log('log in successful!');
    return res.redirect('/landing-page');
});
// LOG OUT
app.get('/log-out', function(req, res){

    if(isAuth){
        req.session.isAuth = false;
        req.session.destroy((err) => {
            if (err) throw err;

            console.log(req.session);
            console.log('log out success!');
            res.redirect('/landing-page');
        })
    }
    
});

// SIGN UP
app.get('/signup', function(req, res){
    res.render('signup');
});
app.post('/create-user', async function(req, res){

    const { username, your_email, password, confirm_password} = req.body;
    console.log(username + " "  + your_email + " " + password + " " + confirm_password);

    const takenUsername = await UserModel.findOne({ username: username});
    // Validation if there is already an existing record with same username
    if (takenUsername) {
        console.log('taken username');
        return res.redirect('/signup');
    }
    const takenEmail = await UserModel.findOne({ email: your_email});
    // Validation if there is already an existing record with same email
    if (takenEmail) {
        console.log('taken email');
        return res.redirect('/signup');
    }
    
    // Validation if passwords match
    if( password !== confirm_password){
        console.log('passwords do not match ' + password + ' - ' + confirm_password);
        return res.redirect('/signup');
    }
    const hashedPassword = createHash('sha256').update(password).digest('hex');

    const newUser = await UserModel({
        username: username,
        email: your_email,
        password: hashedPassword
    });
    await newUser.save();

    //create cart for the user
    const newUserCart = await UserCartModel({
        user_id: newUser,
        username: username, 
        items: []
    }); 
    await newUserCart.save();

    console.log('success!')
    return res.redirect('login');
});


app.listen(3000, () => console.log('Server started on port 3000'));