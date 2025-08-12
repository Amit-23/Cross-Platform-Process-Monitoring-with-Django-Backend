async function loadData() {
    let res = await fetch("http://127.0.0.1:8000/api/processes/latest/");
    let data = await res.json();
    let outputDiv = document.getElementById("output");
    outputDiv.innerHTML = "";
    
    data.forEach(machine => {
        let hostDiv = document.createElement("div");
        hostDiv.innerHTML = `<h3>${machine.hostname} (Last Updated: ${machine.last_updated})</h3>`;
        
        let ul = document.createElement("ul");
        machine.processes.forEach(proc => {
            let li = document.createElement("li");
            li.innerText = `${proc.name} (PID: ${proc.pid}) - CPU: ${proc.cpu_usage}% Mem: ${proc.memory_usage}%`;
            ul.appendChild(li);
        });
        
        hostDiv.appendChild(ul);
        outputDiv.appendChild(hostDiv);
    });
}
