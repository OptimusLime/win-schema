module.exports = sampleSave;

function sampleSave()
{
	var self = this;

	self.winFunction = "save";

	var fullEventName = function(partialName)
	{
		return self.winFunction + ":" + partialName;
	}

	var batchSave = function(artifacts, done)
	{
		console.log('Saving artifacts: ', artifacts);
		done("sample finish saving stuff: " + artifacts);
	}
	var getArtifacts = function(arrWID, done)
	{
		//go on and get our artifacts (either here, or through a request)
		console.log('getting artifacts: ', arrWID)

		//maybe we save all parental objects
		done("artifacts fetched now");
	}

	
	//we are evolution
	//these are the various callbacks we accept as events
	self.eventCallbacks = function()
	{
		var callbacks = {};

		//add callbacks to the object-- these are the functions called when the full event is emitted
		callbacks[fullEventName("batchSave")] = batchSave;
		callbacks[fullEventName("getArtifacts")] = getArtifacts;

		//send back our callbacks
		return callbacks;
	}

	self.requiredEvents = function()
	{
		//don't require any outside modules
		return [];
	}

	self.initialize = function(done)
	{
		process.nextTick(function()
		{
			done();
		})
	}

	return self;
}
