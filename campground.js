const mongoose=require('mongoose');
const { type } = require('os');
// const schema=mongoose.Schema();
const Review=require('./review');

const imageSchema=new mongoose.Schema({
        url:String,
        filename:String
});
imageSchema.virtual('thumbnail').get(function(){
    return this.url.replace('/upload','/upload/w_150');
});

const campgroundschema=new mongoose.Schema({
    title:String,
    price:String,
    images:[imageSchema],
    geometry: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },
    description:String,
    location:String,
    reviews:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:'Review'
        }
    ]
});
// campgroundschema.virtual('properties.popUpMarkup').get(function () {
//     return `
//     <strong><a href="/campgrounds/${this._id}">${this.title}</a><strong>
//     <p>${this.description.substring(0, 20)}...</p>`
// });


campgroundschema.post('findOneandDelete',async function(doc){
     if(doc){
        await Review.deleteMany({
            $in : doc.reviews
        })
     }
});
module.exports=mongoose.model('campground',campgroundschema);

