if(process.env.NODE_ENV !== "production"){
    require('dotenv').config();
}

// const geocoding = maptilerClient({ accessToken: maptilerApiKey });

const express=require('express');
const app=express()
const mongoose=require('mongoose');
const methodOverride=require('method-override');
const ejsmate=require('ejs-mate');
const path= require('path');
const Campground=require('./models/campground');

const { cloudinary }=require('./cloudinary/cloud');
const Review=require('./models/review');
const User=require('./models/user');
const passport=require('passport');
const local=require('passport-local');
const session=require('express-session');
const flash=require('connect-flash');
const catchasync=require('./utils/catchasync');
const expresserror=require('./utils/expresserror');
const {campgroundSchema}=require('./schema');
const multer=require('multer');
const {storage}=require('./cloudinary/cloud');
const upload=multer({storage});
const maptilerClient = require("@maptiler/client");
const mongoSanitize = require('express-mongo-sanitize');
const helmet=require('helmet');
// const url=process.env.DBURL;
const MongoStore = require('connect-mongo');

maptilerClient.config.apiKey = process.env.MAPTILER_API_KEY;
// 'mongodb://localhost:27017/yelpcamp'
const url='mongodb://localhost:27017/yelpcamp';
mongoose.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
    // useCreateIndex: true,
    // useUnifiedTopology: true,
    // useFindAndModify: false
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
    console.log("Database connected");
});

 
app.engine('ejs',ejsmate);
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true}));
app.use(methodOverride('_method'));
app.use(helmet());

app.use(
    mongoSanitize({
      replaceWith: '_',
    }),
  );
const store = MongoStore.create({
    mongoUrl: url,
    touchAfter: 24 * 60 * 60,
    crypto: {
        secret: 'secret!'
    }
});
const sessionconfig = {
    store,
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
};

app.use(session(sessionconfig));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new local(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
app.use((req,res,next)=>{
    // console.log(req.query);
    res.locals.currentUser=req.user;
    res.locals.success=req.flash('success');
    res.locals.error=req.flash('error');
    next();
});


const scriptSrcUrls = [
    "https://stackpath.bootstrapcdn.com/",
    // "https://api.tiles.mapbox.com/",
    // "https://api.mapbox.com/",
    "https://kit.fontawesome.com/",
    "https://cdnjs.cloudflare.com/",
    "https://cdn.jsdelivr.net",
    "https://cdn.maptiler.com/", // add this
];
const styleSrcUrls = [
    "https://kit-free.fontawesome.com/",
    "https://stackpath.bootstrapcdn.com/",
    // "https://api.mapbox.com/",
    // "https://api.tiles.mapbox.com/",
    "https://fonts.googleapis.com/",
    "https://use.fontawesome.com/",
    "https://cdn.jsdelivr.net",
    "https://cdn.maptiler.com/", // add this
];
const connectSrcUrls = [
    // "https://api.mapbox.com/",
    // "https://a.tiles.mapbox.com/",
    // "https://b.tiles.mapbox.com/",
    // "https://events.mapbox.com/",
    "https://api.maptiler.com/", // add this
];
const fontSrcUrls = [];
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: [],
            connectSrc: ["'self'", ...connectSrcUrls],
            scriptSrc: ["'unsafe-inline'", "'self'", ...scriptSrcUrls],
            styleSrc: ["'self'", "'unsafe-inline'", ...styleSrcUrls],
            workerSrc: ["'self'", "blob:"],
            objectSrc: [],
            imgSrc: [
                "'self'",
                "blob:",
                "data:",
                "https://res.cloudinary.com/dvq49leux/", //SHOULD MATCH YOUR CLOUDINARY ACCOUNT! 
                "https://images.unsplash.com/",
                "https://api.maptiler.com/",
            ],
            fontSrc: ["'self'", ...fontSrcUrls],
        },
    })
);

const isLoggedin=(req,res,next)=>{
    if (!req.isAuthenticated()) {
        req.session.returnTo = req.originalUrl
        req.flash('error', 'You must be signed in first!');
        return res.redirect('/login');
    }
    next();
}


const storeReturnTo = (req, res, next) => {
    if (req.session.returnTo) {
        res.locals.returnTo = req.session.returnTo;
    }
    next();
}

const validate=(req,res,next)=>{
    const { error } = campgroundSchema.validate(req.body);
    console.log(req.body);
    if (error) {
        const msg = error.details.map(el => el.message).join(',')
        throw new ExpressError(msg, 400)
    } else {
        next();
    }
};


app.get('/',(req,res)=>{
   res.render('home',{ currentUser: req.user || null });
});

//all campgrounds

app.get('/campground',async(req,res,next)=>{
    const campgrounds= await Campground.find({});
    res.render('campgrounds/index2',{campgrounds});//{currentUser=req.user}
});

app.post('/campground',isLoggedin,upload.array('image'),validate,async(req,res,next)=>{
    if(!req.body.campground) throw new expresserror('invalid',404);
    const campground = new Campground(req.body.campground);
    const geoData = await maptilerClient.geocoding.forward(req.body.campground.location, { limit: 1 });
    
    // res.send(geoData.features[0].geometry);
    campground.geometry = geoData.features[0].geometry;
    campground.images=req.files.map(f=>({url:f.path,filename:f.filename}));
    await campground.save();
    req.flash('success', 'Successfully made a new campground!');
    // console.log(campground);
    res.redirect(`/campground/${campground._id}`);

});

// for adding new campground

app.get('/campground/new',(req,res)=>{
    res.render('campgrounds/new');//{ currentUser: req.user }
});

//displaying campground
app.get('/campground/:id',isLoggedin,async(req,res,next)=>{
    const campground=await Campground.findById(req.params.id).populate('reviews');
    res.render('campgrounds/show',{campground});//, currentUser: req.user
});
//editing campground
app.get('/campground/:id/edit',isLoggedin,async(req,res)=>{
    const campground=await Campground.findById(req.params.id);
    res.render('campgrounds/edit',{ campground});//  
});

app.put('/campground/:id',isLoggedin,upload.array('image'),validate,async(req,res,next)=>{
    const {id}=req.params;
    const campground=await Campground.findByIdAndUpdate(id,{...req.body.campground});
  
    const imgs=req.files.map(f=>({url:f.path,filename:f.filename}));
    campground.images.push(...imgs);

    await campground.save();
    
    if(req.body.deleteimages){
        for(let filename of req.body.deleteimages){
            await cloudinary.uploader.destroy(filename);
        }
        await campground.updateOne({$pull:{images:{filename:{$in :req.body.deleteimages}}}});
    }
    req.flash('success', 'Successfully updated campground!');
    res.redirect(`/campground/${campground._id}`);
});

//deleting campground
app.delete('/campground/:id',isLoggedin,async (req, res) => {
    const { id } = req.params;
    await Campground.findByIdAndDelete(id);
    req.flash('success', 'Successfully deleted campground')
    res.redirect('/campground');
});

// creating and deleting a review
app.post('/campground/:id/review',isLoggedin,async(req,res)=>{
    const campground=await Campground.findById(req.params.id);
    const review=new Review(req.body.review);
    campground.reviews.push(review); 
    await campground.save();
    await review.save();
    req.flash('success', 'Created new review!');
    res.redirect(`/campground/${campground._id}`);
});

app.delete('/campground/:id/review/:reviewId',isLoggedin,async(req,res)=>{
    const { id , reviewId } =req.params;
    await Campground.findByIdAndUpdate(id, { $pull:{ reviews:reviewId }});
    await Review.findByIdAndDelete(reviewId);
    req.flash('success', 'Successfully deleted review')
    res.redirect(`/campground/${id}`);
});

//register route
app.get('/register',(req,res)=>{
    res.render('register',{ currentUser: req.user });
});
app.post('/register',async(req,res,next)=>{
    //  const {username,password,email}=req.body;
    //  const user=await new User({username,email});
    //  const registereduser=await User.register(user,password);
    //  req.login(registereduser,err=>{
    //     if(err) return next(err);
    //     res.redirect('/campground');
    //  })
    try {
        const { email, username, password } = req.body;
        const user = new User({ email, username });
        const registeredUser = await User.register(user, password);
        req.login(registeredUser, err => {
            if (err) return next(err);
            req.flash('success', 'Welcome to CampQuest!');
            res.redirect('/campground');
        })
    } catch (e) {
        req.flash('error', e.message);
        res.redirect('register');
    }
    //console.log(registereduser);
});


//login route
app.get('/login',(req,res,next)=>{
    res.render('login');
});
app.post('/login',storeReturnTo,passport.authenticate('local',{failureFlash:true,failureRedirect:'/login'}),async(req,res,next)=>{
    req.flash('success','welcome back!');
    const url=req.session.returnTo || '/campground';
    delete req.session.returnTo;
    res.redirect(url);
});


// logout
app.get('/logout',(req,res,next)=>{
    req.logout(function(err){
        if(err){
            return next(err);
        }
        req.flash('success','goodbye!');
        res.redirect('/campground');
    });
    // req.logout();
    // req.flash('success', "Goodbye!");
    // res.redirect('/campgrounds');
});



app.all('*', (req, res, next) => {
    next(new ExpressError('Page Not Found', 404));
});

// Error handler
app.use((err, req, res, next) => {
    const { status = 500, message = 'Something went wrong!' } = err;
    res.status(status).render('error', { err });
});

// Connection
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});