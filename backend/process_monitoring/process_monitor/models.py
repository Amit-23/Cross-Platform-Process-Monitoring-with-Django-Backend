from django.db import models

class Machine(models.Model):
    hostname = models.CharField(max_length=255, unique=True)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.hostname


class Process(models.Model):
    machine = models.ForeignKey(Machine, related_name='processes', on_delete=models.CASCADE)
    pid = models.IntegerField()
    name = models.CharField(max_length=255)
    cpu_usage = models.FloatField()
    memory_usage = models.FloatField()
    parent_pid = models.IntegerField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Process {self.name} (PID: {self.pid}) on {self.machine.hostname}"