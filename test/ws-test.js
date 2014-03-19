
var assert = require('assert');
var should = require('should');
var colors = require('colors');

var winschema = require('../');
var winback = require('win-backbone');
var Q = require('q');
var util = require('util');


var qBackboneEmit = function()
{
	//defer the mofo please!
	var defer = Q.defer();

	//take out the first arguments
	var backbone =  [].shift.call(arguments);

	if(typeof backbone == "string")
		throw new Error("Q callback wrong first arg should be backbone, not :" + backbone)

	var cb = function(err)
	{
		if(err)
			defer.reject.apply(defer, arguments);
		else{
			[].shift.call(arguments);
			//take out the error
			defer.resolve.apply(defer, arguments)
		}
	};

	[].push.call(arguments, cb);

	backbone.emit.apply(backbone, arguments);

	//send back our promise to resolve/reject
	return defer.promise;
}

var emptyModule = 
{
	winFunction : "test",
	eventCallbacks : function(){ return {}; },
	requiredEvents : function() {
		return [
		"schema:addSchema",
		"schema:getSchema",
		"schema:getSchemaReferences",
		"schema:validate"
		];
	},
	initialize : function(done)
    {
        process.nextTick(function()
        {
            done();
        })
    }
};

describe('Testing Win Generating Artifacts -',function(){

    //we need to start up the WIN backend
    before(function(done){

    	var sampleJSON = 
		{
			"win-schema" : winschema,
			"test" : emptyModule
		};

		var configurations = 
		{
			"win-schema" : {
				multipleErrors : true,
				allowAnyObjects : false,
				requireByDefault : false
			}
		};

    	backbone = new winback();

    	//loading modules is synchronous
    	backbone.loadModules(sampleJSON, configurations);

    	var registeredEvents = backbone.registeredEvents();
    	var requiredEvents = backbone.moduleRequirements();
    		
    	console.log('Backbone Events registered: ', registeredEvents);
    	console.log('Required: ', requiredEvents);

    	backbone.initializeModules(function()
    	{
 			done();
    	});

    });

    it('Should add schema successfully',function(done){

    	var otherSchema = {
    		things : "string"
    	};
    	var exampleSchema  = {
    		// noFirst : "object",
    		// yesFirst : {type: "object", yesSecond: {noThird: "array", noFourth: "object"}},
    		bugger : {this : "string"},
    		// noSecond : "array",
    		ref : {"$ref": "secondSchema"}


    		// required : ['hope', 'stuff']		
    	};

    	var validExample = {
    		bugger : {skip : "string"},
    		hope : "stuff",
    		stuff : {
    			num : 4,
    			inner : {

    				geno : {things : []},
    				geno2 : "some string"
    			}
    		}
    	}

    	var thingy = {
    		bugger : {this : "help"},
    		hope : { notProp: 5, isProp: 5},
    		ref : {things : "stuff"},
    		stuff : {
    			num : "5",
    			inner: {
    				geno : {},
    				geno2 : "some string"
    			},
    			wrong : "things"
    		},
    		not : "the right stuff"
    	};

		console.log('Adding exampleSchema');
    	qBackboneEmit(backbone, "test",  "schema:addSchema", "exampleSchema", exampleSchema)
    		.then(function()
			{
				console.log('Adding secondSchema');
		 		return qBackboneEmit(backbone, "test",  "schema:addSchema", "secondSchema", otherSchema);
			})
			.then(function()
			{
				return qBackboneEmit(backbone, "test",  "schema:getSchema", "exampleSchema");
			})
    		.then(function(fullSchema)
    		{	
    			console.log("\tFull schema: ".blue, util.inspect(fullSchema, false, 10));
    			return qBackboneEmit(backbone, "test", "schema:validate", "exampleSchema", thingy);
    		})
    		.then(function(isValid, reasons)
    		{
    			console.log('validity results - valid? ', isValid, " if not, why not? ", reasons);

    			//done for now
    			done();
    		})
    		.fail(function(err){
    			console.log('Error found: ', err);
    			
    			err = typeof err == "string" ? new Error(err) : err;
    			done(err);
    		});

    });




});