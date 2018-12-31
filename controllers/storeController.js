const mongoose = require('mongoose');
const Store = mongoose.model('Store');
const User = mongoose.model('User');
const multer = require('multer'); // uploads
const jimp = require('jimp'); // resize photo
const uuid = require('uuid'); // unique id

const multerOptions = {
    storage: multer.memoryStorage(),
    fileFilter(req, file, next) { // fileFilter: function()
        const isPhoto = file.mimetype.startsWith('image');
        if (isPhoto) {
            next(null, true);
        } else {
            next({ message: 'That file type is not supported' }, false);
        }
    }
}

exports.homePage = (req, res) => {
    res.render('index', { title: 'Index'});
};

exports.addStore = (req, res) => {
    res.render('editStore', { title: 'Add Store'});
};

exports.upload = multer(multerOptions).single('photo');

exports.resize = async(req, res, next) => {
    if (!req.file) {
        next();
        return;
    }

    const extension = req.file.mimetype.split('/')[1];
    req.body.photo = `${uuid.v4()}.${extension}`;
    const photo = await jimp.read(req.file.buffer);
    await photo.resize(800, jimp.AUTO);
    await photo.write(`./public/uploads/${req.body.photo}`);
    next();
}

exports.createStore = async (req, res) => {
    req.body.author = req.user._id;
    const store = await (new Store(req.body)).save();
    req.flash('success', `Successfully created ${store.name}. Care to leave a review?`);
    res.redirect(`/store/${store.slug}`);
};

exports.getStores = async (req, res) => {
    const page = req.params.page || 1;
    const limit = 4;
    const skip = (page * limit) - limit;
    
    const storesPromise = Store
    .find()
    .skip(skip)
    .limit(limit)
    .sort( {created: 'desc' }); // the newest store created

    const countPromise = Store.count();

    const [stores, count] = await Promise.all([storesPromise, countPromise]);

    const pages = Math.ceil(count / limit);

    if (!stores.length && skip) {
        req.flash('info', `Hey you asked for page ${page}. But that doesn't exist. So I put you on page ${pages}`);
        res.redirect(`/stores/page/${pages}`);
        return;
    }

    res.render('stores', { title: 'Stores', stores: stores, count, pages, page });
};

const confirmOwner = (store, user) => {
    if (!store.author.equals(user._id)){
        throw Error('You must own a store in order to edit it');
    }
};

exports.editStore = async (req, res) => {
    // 1. Find the store by id
    const store = await Store.findOne({_id: req.params.id});
    
    // 2. Confirm they are owner of the store
    confirmOwner(store, req.user);

    // 3. Render the edit form
    res.render('editStore', {title: `Edit ${store.name}`, store: store})
};

exports.updateStore = async (req, res) => {
    req.body.location.type = 'Point';
    // 1. Find and update store
    const store = await Store.findOneAndUpdate({ _id: req.params.id}, req.body, {
        new: true, // return new store instead of old one
        runValidators: true
    }).exec();

     // 2. Redirect them to the store and notify
     req.flash('success', `Successfully updated <strong>${store.name}</strong>. <a href="/stores/${store.slug}">View Store</a>`);
     res.redirect(`/stores/${store._id}/edit`);
};

exports.getStoreBySlug = async (req, res, next) => {
    const store = await Store.findOne({slug: req.params.slug}).populate('author reviews').exec();
    if (!store) return next();
    res.render('store', {title: `${store.name}`, store});
};

exports.getStoresByTag = async (req, res) => {
    const tag = req.params.tag;
    const tagQuery = tag || { $exists: true };

    const tagsPromise = Store.getTagsList();
    const storesPromise = Store.find({ tags: tagQuery });
    const [tags, stores] = await Promise.all([tagsPromise, storesPromise]);
    
    res.render('tag', { title: 'Tags', tags, tag, stores });
};

exports.searchStores = async (req, res) => {
    const stores = await Store.find({
        $text: {
            $search: req.query.q
        }
    }, {
        score: { $meta: 'textScore' } 
    })
    .sort({ score: { $meta: 'textScore' }})
    .limit(5);
    res.json(stores);
};

exports.mapStores = async (req, res) => {
    var coordinates = [req.query.lng, req.query.lat].map(parseFloat);
    var limit = req.params.limit;
    
    const q = {
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates
                },
                $maxDistance: 10000 // meters
            }
        }
    };

    const stores = await Store.find(q).select('slug name description location photo').limit(limit);
    res.json(stores); 
};

exports.mapPage = (req, res) => {
    res.render('map', {title: 'Maps'});
};

exports.heartStore = async (req, res) => {
    const hearts = req.user.hearts.map(obj => obj.toString()); // there is a toString overload for this object
    
    const operator = hearts.includes(req.params.id) ? '$pull' : '$addToSet';
    const user = await User
    .findByIdAndUpdate(req.user._id,
        { [operator]: { hearts: req.params.id }},
        { new: true } // returns updated user
    );
    res.json(user);
};

exports.getHearts = async (req, res) => {
    // 1 populate
    // where id is in array
    const stores = await Store.find({
        _id: { $in: req.user.hearts}
    });

    res.render('stores', { title: 'Hearted Stores', stores });
};

exports.getTopStores = async (req, res) => {
    const stores = await Store.getTopStores();
    res.render('topStores', { stores, title: 'Top Stores' });
};